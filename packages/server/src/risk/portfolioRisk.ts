import { AssetAgent } from '../bots/hypertrades/assetAgent.js';
import { prisma } from '../db.js';

export class PortfolioRiskManager {
  equity = 10000; // Default value if DB lookup fails
  dayPnl = 0;
  openRiskPct = 0;
  maxDailyLoss = 0.03;   // 3%
  maxOpenRisk = 0.05;    // 5% combined
  
  /**
   * Initialize portfolio risk manager
   * Loads starting equity from database if available
   */
  async init() {
    try {
      const accountState = await prisma.accountState.findFirst();
      if (accountState && accountState.equity) {
        this.equity = accountState.equity;
        console.log(`Loaded starting equity from DB: ${this.equity}`);
      } else {
        console.log(`Using default starting equity: ${this.equity}`);
      }
    } catch (error) {
      console.error('Failed to load equity from DB:', error);
      console.log(`Using default starting equity: ${this.equity}`);
    }
  }
  
  /**
   * Checks if trading should be allowed based on current risk limits
   * @returns {boolean} true if trading is allowed, false if risk limits are exceeded
   */
  canTrade() { 
    return this.dayPnl > -this.maxDailyLoss * this.equity && this.openRiskPct < this.maxOpenRisk; 
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
    }
  }
} 