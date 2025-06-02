import { AssetAgent } from '../bots/hypertrades/assetAgent.js';
import { prisma } from '../db.js';
import { createLogger } from '../utils/logger.js';
import { notify } from '../ops/alertService.js';

// Create logger
const logger = createLogger('portfolioRisk');

// Define type for HyperSettings to include our new fields
type HyperSettings = {
  id: number;
  smcThresh: number;
  rsiOS: number;
  rsiOB?: number;
  symbols: string;
  riskPct?: number;
  smcMinRetrace?: number;
  maxDailyLoss: number;
  maxOpenRisk: number;
  updatedAt: Date;
  strategyParams: string;
};

export class PortfolioRiskManager {
  equity = 10000; // Default value if DB lookup fails
  dayPnl = 0;
  openRiskPct = 0;
  maxDailyLoss = 0.03;   // 3% default
  maxOpenRisk = 0.05;    // 5% combined default
  private refreshTimer: NodeJS.Timeout | null = null;
  
  /**
   * Initialize portfolio risk manager
   * Loads starting equity from database if available
   */
  async init() {
    try {
      // Load account state
      const accountState = await prisma.accountState.findFirst();
      if (accountState && accountState.equity) {
        this.equity = accountState.equity;
        console.log(`Loaded starting equity from DB: ${this.equity}`);
      } else {
        console.log(`Using default starting equity: ${this.equity}`);
      }
      
      // Load risk limits from HyperSettings
      await this.loadRiskLimits();
      
      // Set up hourly refresh of risk limits
      this.refreshTimer = setInterval(() => this.loadRiskLimits(), 60 * 60 * 1000);
    } catch (error) {
      console.error('Failed to initialize PortfolioRiskManager:', error);
      await notify(`Failed to initialize PortfolioRiskManager: ${error}`);
    }
  }
  
  /**
   * Loads risk limits from HyperSettings table
   */
  private async loadRiskLimits() {
    try {
      const settings = await prisma.hyperSettings.findUnique({ where: { id: 1 } });
      if (settings) {
        // Cast to our extended type
        const typedSettings = settings as unknown as HyperSettings;
        this.maxDailyLoss = typedSettings.maxDailyLoss;
        this.maxOpenRisk = typedSettings.maxOpenRisk;
        console.log(`Loaded risk limits from DB: maxDailyLoss=${this.maxDailyLoss}, maxOpenRisk=${this.maxOpenRisk}`);
      }
    } catch (error) {
      console.error('Failed to load risk limits from DB:', error);
      await notify(`Failed to load risk limits from DB: ${error}`);
    }
  }
  
  /**
   * Checks if trading should be allowed based on current risk limits
   * @returns {boolean} true if trading is allowed, false if risk limits are exceeded
   */
  canTrade(): boolean { 
    // Convert dayPnl to percentage of equity
    const dayLossPct = this.dayPnl < 0 ? Math.abs(this.dayPnl) / this.equity : 0;
    
    // Check day loss limit
    if (dayLossPct >= this.maxDailyLoss) {
      const alertMessage = `VETO-PORTFOLIO day loss limit exceeded: open=${this.openRiskPct}, loss=${dayLossPct}`;
      logger.warn(alertMessage, { open: this.openRiskPct, loss: dayLossPct });
      notify(alertMessage).catch(err => console.error('Failed to send Slack notification:', err));
      
      // Persist risk veto
      this.persistRiskVeto('day_loss', dayLossPct, this.openRiskPct);
      
      return false;
    }
    
    // Check open risk limit
    if (this.openRiskPct >= this.maxOpenRisk * 100) {
      const alertMessage = `VETO-PORTFOLIO open risk limit exceeded: open=${this.openRiskPct}, loss=${dayLossPct}`;
      logger.warn(alertMessage, { open: this.openRiskPct, loss: dayLossPct });
      notify(alertMessage).catch(err => console.error('Failed to send Slack notification:', err));
      
      // Persist risk veto
      this.persistRiskVeto('open_risk', dayLossPct, this.openRiskPct);
      
      return false;
    }
    
    return true;
  }
  
  /**
   * Persist risk veto to the database
   * @param {string} reason The reason for the risk veto
   * @param {number} dayLossPct Current day loss percentage
   * @param {number} openRiskPct Current open risk percentage
   */
  private async persistRiskVeto(reason: string, dayLossPct: number, openRiskPct: number): Promise<void> {
    try {
      await prisma.rLDataset.create({
        data: {
          symbol: 'portfolio', // This is a portfolio-wide decision
          featureVec: JSON.stringify({
            reason,
            dayLossPct,
            openRiskPct,
            maxDailyLoss: this.maxDailyLoss,
            maxOpenRisk: this.maxOpenRisk * 100,
            timestamp: new Date().toISOString()
          }),
          action: 'blocked_risk',
          outcome: 0,
        }
      });
    } catch (error) {
      logger.error('Failed to persist risk veto:', { error });
      await notify(`Failed to persist risk veto: ${error}`).catch(err => console.error('Failed to send Slack notification:', err));
    }
  }
  
  /**
   * Recalculates portfolio-wide risk metrics based on all agents
   * @param {Map<string, AssetAgent>} agents Map of all trading agents
   */
  recalc(agents: Map<string, AssetAgent>) {
    // Calculate combined open risk across all agents
    this.openRiskPct = [...agents.values()].reduce((sum, agent) => sum + agent.risk.openRisk, 0);
    
    // Update day PnL
    this.dayPnl = [...agents.values()].reduce((sum, agent) => sum + agent.risk.dayPnL, 0);
    
    // Update equity
    this.equity = [...agents.values()].reduce((sum, agent) => sum + agent.risk.equity, 0);
    
    // Persist updated equity to database
    this.updateEquity();
  }
  
  /**
   * Update equity value in the database
   */
  private async updateEquity() {
    try {
      await prisma.accountState.upsert({
        where: { id: 1 },
        update: { equity: this.equity },
        create: { id: 1, equity: this.equity }
      });
    } catch (error) {
      console.error('Failed to update equity in DB:', error);
      await notify(`Failed to update equity in DB: ${error}`).catch(err => console.error('Failed to send Slack notification:', err));
    }
  }
  
  /**
   * Handles the closing of a position and updates equity in database
   */
  async closePosition() {
    // Update the equity in the database
    await prisma.accountState.upsert({
      where: { id: 1 },
      update: { equity: this.equity },
      create: { id: 1, equity: this.equity }
    });
  }
  
  /**
   * Cleans up resources when shutting down
   */
  destroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
} 