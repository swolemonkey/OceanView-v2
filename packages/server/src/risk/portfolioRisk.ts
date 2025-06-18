import { AssetAgent } from '../bots/hypertrades/assetAgent.js';
import { prisma } from '../db.js';
import { createLogger, type EnhancedLogger, type PortfolioContext, type RiskContext } from '../utils/logger.js';
import { notify } from '../ops/alertService.js';
import { executionMonitor } from '../monitoring/executionMonitor.js';
import { randomUUID } from 'crypto';

// Create enhanced logger
const logger = createLogger('portfolioRisk') as EnhancedLogger;

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

// Risk check result interface
interface RiskCheckResult {
  canTrade: boolean;
  riskLevel: 'safe' | 'warning' | 'danger' | 'critical';
  breaches: RiskBreach[];
  warnings: RiskWarning[];
  metrics: RiskMetrics;
  checkId: string;
  timestamp: number;
}

interface RiskBreach {
  type: 'day_loss' | 'open_risk' | 'equity_threshold' | 'position_count';
  current: number;
  limit: number;
  severity: 'warning' | 'critical';
  message: string;
}

interface RiskWarning {
  type: 'approaching_limit' | 'rapid_loss' | 'high_concentration' | 'unusual_volatility';
  current: number;
  threshold: number;
  message: string;
  recommendedAction: string;
}

interface RiskMetrics {
  equity: number;
  dayPnL: number;
  dayPnLPercent: number;
  openRisk: number;
  openRiskPercent: number;
  positionCount: number;
  maxDailyLossLimit: number;
  maxOpenRiskLimit: number;
  utilizationRatio: number; // How close we are to limits (0-1)
}

export class PortfolioRiskManager {
  equity = 10000; // Default value if DB lookup fails
  dayPnl = 0;
  openRiskPct = 0;
  maxDailyLoss = 0.03;   // 3% default
  maxOpenRisk = 0.05;    // 5% combined default
  private refreshTimer: NodeJS.Timeout | null = null;
  
  // Enhanced risk tracking
  private lastRiskCheckTime = 0;
  private riskCheckInterval = 30000; // 30 seconds between detailed checks
  private lastEquity = 10000;
  private consecutiveWarnings = 0;
  private maxConsecutiveWarnings = 3;
  private riskHistory: RiskMetrics[] = [];
  private maxRiskHistoryLength = 100;
  
  // Warning thresholds (percentages of limits)
  private readonly WARNING_THRESHOLD = 0.75; // 75% of limit
  private readonly DANGER_THRESHOLD = 0.9;   // 90% of limit
  private readonly CRITICAL_THRESHOLD = 1.0; // 100% of limit (breach)
  
  /**
   * Initialize portfolio risk manager
   * Loads starting equity from database if available
   */
  async init() {
    try {
      logger.info('🚀 PORTFOLIO RISK: Initializing Portfolio Risk Manager', {
        phase: 'initialization',
        defaultEquity: this.equity,
        warningThreshold: this.WARNING_THRESHOLD,
        dangerThreshold: this.DANGER_THRESHOLD
      });

      // Load account state
      const accountState = await prisma.accountState.findFirst();
      if (accountState && accountState.equity) {
        this.equity = accountState.equity;
        this.lastEquity = accountState.equity;
        logger.info(`💰 PORTFOLIO RISK: Loaded starting equity from database`, {
          equity: this.equity,
          source: 'database',
          accountStateId: accountState.id
        });
      } else {
        logger.warn(`⚠️ PORTFOLIO RISK: No account state found, using default equity`, {
          equity: this.equity,
          source: 'default',
          recommendation: 'Initialize account state in database'
        });
      }
      
      // Load risk limits from HyperSettings
      await this.loadRiskLimits();
      
      // Set up periodic refresh of risk limits (every hour)
      this.refreshTimer = setInterval(() => {
        logger.debug('🔄 PORTFOLIO RISK: Refreshing risk limits from database', {
          phase: 'periodic_refresh'
        });
        this.loadRiskLimits();
      }, 60 * 60 * 1000);

      // Log successful initialization
      const initialMetrics = this.calculateRiskMetrics(new Map());
      logger.info(`✅ PORTFOLIO RISK: Portfolio Risk Manager initialized successfully`, {
        equity: this.equity,
        maxDailyLoss: this.maxDailyLoss,
        maxOpenRisk: this.maxOpenRisk,
        initialMetrics,
        refreshIntervalMs: 60 * 60 * 1000
      });

    } catch (error) {
      logger.error('❌ PORTFOLIO RISK: Failed to initialize Portfolio Risk Manager', { 
        error: error instanceof Error ? error.message : String(error),
        phase: 'initialization'
      });
      await notify(`Failed to initialize PortfolioRiskManager: ${error}`);
      throw error;
    }
  }
  
  /**
   * Calculate comprehensive risk metrics
   */
  private calculateRiskMetrics(agents: Map<string, AssetAgent>): RiskMetrics {
    const totalOpenRisk = [...agents.values()].reduce((sum, agent) => sum + agent.risk.openRisk, 0);
    const totalDayPnL = [...agents.values()].reduce((sum, agent) => sum + agent.risk.dayPnL, 0);
    const totalEquity = [...agents.values()].reduce((sum, agent) => sum + agent.risk.equity, 0) || this.equity;
    const positionCount = [...agents.values()].reduce((count, agent) => count + agent.risk.positions.length, 0);

    const dayPnLPercent = totalDayPnL / totalEquity;
    const openRiskPercent = totalOpenRisk / totalEquity;
    
    // Calculate utilization ratio (how close to limits)
    const dayLossUtilization = Math.abs(dayPnLPercent) / this.maxDailyLoss;
    const openRiskUtilization = openRiskPercent / this.maxOpenRisk;
    const utilizationRatio = Math.max(dayLossUtilization, openRiskUtilization);

    return {
      equity: totalEquity,
      dayPnL: totalDayPnL,
      dayPnLPercent: dayPnLPercent,
      openRisk: totalOpenRisk,
      openRiskPercent: openRiskPercent,
      positionCount,
      maxDailyLossLimit: this.maxDailyLoss,
      maxOpenRiskLimit: this.maxOpenRisk,
      utilizationRatio
    };
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
        this.maxDailyLoss = typedSettings.maxDailyLoss || 0.03; // Default to 3% if undefined
        this.maxOpenRisk = typedSettings.maxOpenRisk || 0.05;   // Default to 5% if undefined
        console.log(`Loaded risk limits from DB: maxDailyLoss=${this.maxDailyLoss}, maxOpenRisk=${this.maxOpenRisk}`);
      }
    } catch (error) {
      console.error('Failed to load risk limits from DB:', error);
      await notify(`Failed to load risk limits from DB: ${error}`);
    }
  }
  
  /**
   * Enhanced canTrade method with comprehensive risk checking
   */
  canTrade(agents?: Map<string, AssetAgent>): boolean { 
    // Modified risk checks for backtests - allow some losses but prevent cascade failures
    if (process.env.MODE === 'backtest' || process.env.NODE_ENV === 'test') {
      const agentsMap = agents || new Map();
      const riskCheck = this.performRiskCheck(agentsMap);
      
      // Allow higher loss limits in backtest mode but still enforce some protection
      const backtestMaxDailyLoss = 0.08; // 8% instead of 3% for backtests
      const backtestMaxOpenRisk = 0.12;  // 12% instead of 5% for backtests
      
      const dayLossPercent = Math.abs(riskCheck.metrics.dayPnLPercent);
      const openRiskPercent = riskCheck.metrics.openRiskPercent;
      
      if (dayLossPercent >= backtestMaxDailyLoss) {
        logger.warn('🛡️ PORTFOLIO RISK: Backtest loss limit reached - blocking further trades', {
          dayLossPercent: (dayLossPercent * 100).toFixed(2) + '%',
          limit: (backtestMaxDailyLoss * 100).toFixed(2) + '%',
          mode: 'backtest_protection'
        });
        return false;
      }
      
      if (openRiskPercent >= backtestMaxOpenRisk) {
        logger.warn('🛡️ PORTFOLIO RISK: Backtest open risk limit reached - blocking further trades', {
          openRiskPercent: (openRiskPercent * 100).toFixed(2) + '%',
          limit: (backtestMaxOpenRisk * 100).toFixed(2) + '%',
          mode: 'backtest_protection'
        });
        return false;
      }
      
      logger.debug('🔄 PORTFOLIO RISK: Backtest mode - limited risk checks passed', {
        dayLoss: (dayLossPercent * 100).toFixed(2) + '%',
        openRisk: (openRiskPercent * 100).toFixed(2) + '%',
        mode: 'backtest_limited'
      });
      return true;
    }
    
    const agentsMap = agents || new Map();
    const riskCheck = this.performRiskCheck(agentsMap);
    
    // Update risk history
    this.riskHistory.push(riskCheck.metrics);
    if (this.riskHistory.length > this.maxRiskHistoryLength) {
      this.riskHistory.shift();
    }

    // Log detailed risk check results
    this.logRiskCheck(riskCheck);

    // Handle breaches
    if (riskCheck.breaches.length > 0) {
      this.handleRiskBreaches(riskCheck);
    }

    // Handle warnings
    if (riskCheck.warnings.length > 0) {
      this.handleRiskWarnings(riskCheck);
    }

    // Track consecutive warnings
    if (riskCheck.riskLevel === 'warning' || riskCheck.riskLevel === 'danger') {
      this.consecutiveWarnings++;
      if (this.consecutiveWarnings >= this.maxConsecutiveWarnings) {
        logger.warn('🚨 PORTFOLIO RISK: Multiple consecutive risk warnings detected', {
          consecutiveWarnings: this.consecutiveWarnings,
          maxConsecutiveWarnings: this.maxConsecutiveWarnings,
          riskLevel: riskCheck.riskLevel,
          recommendation: 'Consider manual intervention'
        });
      }
    } else {
      this.consecutiveWarnings = 0;
    }

    // Update last check time and equity
    this.lastRiskCheckTime = Date.now();
    this.lastEquity = riskCheck.metrics.equity;

    return riskCheck.canTrade;
  }

  /**
   * Enhanced risk checking with detailed analysis and warnings
   */
  private performRiskCheck(agents: Map<string, AssetAgent>): RiskCheckResult {
    const checkId = randomUUID();
    const timestamp = Date.now();
    const metrics = this.calculateRiskMetrics(agents);
    
    const breaches: RiskBreach[] = [];
    const warnings: RiskWarning[] = [];
    
    // Check day loss limits
    const dayLossPercent = Math.abs(metrics.dayPnLPercent);
    if (dayLossPercent >= this.maxDailyLoss) {
      breaches.push({
        type: 'day_loss',
        current: dayLossPercent,
        limit: this.maxDailyLoss,
        severity: 'critical',
        message: `Daily loss limit exceeded: ${(dayLossPercent * 100).toFixed(2)}% vs limit ${(this.maxDailyLoss * 100).toFixed(2)}%`
      });
    } else if (dayLossPercent >= this.maxDailyLoss * this.DANGER_THRESHOLD) {
      breaches.push({
        type: 'day_loss',
        current: dayLossPercent,
        limit: this.maxDailyLoss,
        severity: 'warning',
        message: `Approaching daily loss limit: ${(dayLossPercent * 100).toFixed(2)}% vs limit ${(this.maxDailyLoss * 100).toFixed(2)}%`
      });
    } else if (dayLossPercent >= this.maxDailyLoss * this.WARNING_THRESHOLD) {
      warnings.push({
        type: 'approaching_limit',
        current: dayLossPercent,
        threshold: this.maxDailyLoss * this.WARNING_THRESHOLD,
        message: `Daily loss approaching warning threshold: ${(dayLossPercent * 100).toFixed(2)}%`,
        recommendedAction: 'Consider reducing position sizes or tightening stops'
      });
    }

    // Check open risk limits
    if (metrics.openRiskPercent >= this.maxOpenRisk) {
      breaches.push({
        type: 'open_risk',
        current: metrics.openRiskPercent,
        limit: this.maxOpenRisk,
        severity: 'critical',
        message: `Open risk limit exceeded: ${(metrics.openRiskPercent * 100).toFixed(2)}% vs limit ${(this.maxOpenRisk * 100).toFixed(2)}%`
      });
    } else if (metrics.openRiskPercent >= this.maxOpenRisk * this.DANGER_THRESHOLD) {
      breaches.push({
        type: 'open_risk',
        current: metrics.openRiskPercent,
        limit: this.maxOpenRisk,
        severity: 'warning',
        message: `Approaching open risk limit: ${(metrics.openRiskPercent * 100).toFixed(2)}% vs limit ${(this.maxOpenRisk * 100).toFixed(2)}%`
      });
    } else if (metrics.openRiskPercent >= this.maxOpenRisk * this.WARNING_THRESHOLD) {
      warnings.push({
        type: 'approaching_limit',
        current: metrics.openRiskPercent,
        threshold: this.maxOpenRisk * this.WARNING_THRESHOLD,
        message: `Open risk approaching warning threshold: ${(metrics.openRiskPercent * 100).toFixed(2)}%`,
        recommendedAction: 'Avoid opening new positions until risk decreases'
      });
    }

    // Check for rapid equity loss
    const equityChange = (metrics.equity - this.lastEquity) / this.lastEquity;
    if (equityChange < -0.02) { // 2% rapid loss
      warnings.push({
        type: 'rapid_loss',
        current: equityChange,
        threshold: -0.02,
        message: `Rapid equity loss detected: ${(equityChange * 100).toFixed(2)}%`,
        recommendedAction: 'Review open positions and consider reducing exposure'
      });
    }

    // Check for high position concentration
    if (metrics.positionCount > 5) {
      warnings.push({
        type: 'high_concentration',
        current: metrics.positionCount,
        threshold: 5,
        message: `High number of open positions: ${metrics.positionCount}`,
        recommendedAction: 'Consider consolidating positions to reduce complexity'
      });
    }

    // Determine overall risk level
    let riskLevel: 'safe' | 'warning' | 'danger' | 'critical' = 'safe';
    if (breaches.some(b => b.severity === 'critical')) {
      riskLevel = 'critical';
    } else if (breaches.some(b => b.severity === 'warning')) {
      riskLevel = 'danger';
    } else if (warnings.length > 0) {
      riskLevel = 'warning';
    }

    // Determine if trading can continue
    const canTrade = !breaches.some(b => b.severity === 'critical');

    return {
      canTrade,
      riskLevel,
      breaches,
      warnings,
      metrics,
      checkId,
      timestamp
    };
  }

  /**
   * Log comprehensive risk check results
   */
  private logRiskCheck(riskCheck: RiskCheckResult) {
    const riskData = {
      checkId: riskCheck.checkId,
      riskLevel: riskCheck.riskLevel,
      canTrade: riskCheck.canTrade,
      dayPnLPercent: riskCheck.metrics.dayPnLPercent,
      openRiskPercent: riskCheck.metrics.openRiskPercent,
      utilizationRatio: riskCheck.metrics.utilizationRatio,
      positionCount: riskCheck.metrics.positionCount,
      breachCount: riskCheck.breaches.length,
      warningCount: riskCheck.warnings.length
    };

    // Use appropriate log level based on risk level
    switch (riskCheck.riskLevel) {
      case 'critical':
        logger.error('🚨 PORTFOLIO RISK: CRITICAL RISK LEVEL', riskData);
        break;
      case 'danger':
        logger.warn('⚠️ PORTFOLIO RISK: DANGER RISK LEVEL', riskData);
        break;
      case 'warning':
        logger.warn('⚠️ PORTFOLIO RISK: WARNING RISK LEVEL', riskData);
        break;
      default:
        logger.debug('✅ PORTFOLIO RISK: SAFE RISK LEVEL', riskData);
    }

    // Log detailed metrics with new logRiskCheck method
    logger.logRiskCheck('portfolio', {
      metrics: riskCheck.metrics,
      breaches: riskCheck.breaches,
      warnings: riskCheck.warnings,
      riskLevel: riskCheck.riskLevel,
      canTrade: riskCheck.canTrade,
      checkId: riskCheck.checkId
    });
  }

  /**
   * Handle risk breaches with comprehensive logging and actions
   */
  private async handleRiskBreaches(riskCheck: RiskCheckResult) {
    for (const breach of riskCheck.breaches) {
      logger.error(`🚨 PORTFOLIO RISK BREACH: ${breach.type.toUpperCase()}`, {
        checkId: riskCheck.checkId,
        breachType: breach.type,
        severity: breach.severity,
        current: breach.current,
        limit: breach.limit,
        message: breach.message,
        utilizationRatio: riskCheck.metrics.utilizationRatio,
        equity: riskCheck.metrics.equity,
        dayPnL: riskCheck.metrics.dayPnL,
        openRisk: riskCheck.metrics.openRisk,
        positionCount: riskCheck.metrics.positionCount
      });

      // Record risk breach in execution monitor
      executionMonitor.recordRiskBreach(
        breach.severity,
        breach.type,
        {
          checkId: riskCheck.checkId,
          current: breach.current,
          limit: breach.limit,
          symbol: 'portfolio',
          metrics: riskCheck.metrics
        }
      );

      // Send critical alerts
      if (breach.severity === 'critical') {
        const alertMessage = `CRITICAL RISK BREACH: ${breach.message}`;
        await notify(alertMessage).catch(err => 
          logger.error('Failed to send critical risk breach notification', { 
            error: err instanceof Error ? err.message : String(err),
            breach: breach.type,
            checkId: riskCheck.checkId
          })
        );
      }

      // Persist risk breach to database
      await this.persistRiskBreach(breach, riskCheck);
    }
  }

  /**
   * Handle risk warnings with logging and recommendations
   */
  private handleRiskWarnings(riskCheck: RiskCheckResult) {
    for (const warning of riskCheck.warnings) {
      logger.warn(`⚠️ PORTFOLIO RISK WARNING: ${warning.type.toUpperCase()}`, {
        checkId: riskCheck.checkId,
        warningType: warning.type,
        current: warning.current,
        threshold: warning.threshold,
        message: warning.message,
        recommendedAction: warning.recommendedAction,
        consecutiveWarnings: this.consecutiveWarnings
      });
    }
  }

  /**
   * Enhanced risk breach persistence with detailed context
   */
  private async persistRiskBreach(breach: RiskBreach, riskCheck: RiskCheckResult): Promise<void> {
    try {
      await prisma.rLDataset.create({
        data: {
          symbol: 'portfolio',
          featureVec: JSON.stringify({
            checkId: riskCheck.checkId,
            breachType: breach.type,
            severity: breach.severity,
            current: breach.current,
            limit: breach.limit,
            message: breach.message,
            metrics: riskCheck.metrics,
            riskLevel: riskCheck.riskLevel,
            consecutiveWarnings: this.consecutiveWarnings,
            timestamp: new Date().toISOString()
          }),
          action: `risk_breach_${breach.type}`,
          outcome: breach.severity === 'critical' ? -1 : -0.5,
        }
      });

      logger.debug('📊 PORTFOLIO RISK: Risk breach persisted to database', {
        checkId: riskCheck.checkId,
        breachType: breach.type,
        severity: breach.severity
      });
    } catch (error) {
      logger.error('❌ PORTFOLIO RISK: Failed to persist risk breach', { 
        checkId: riskCheck.checkId,
        error: error instanceof Error ? error.message : String(error),
        breach: breach.type
      });
      await notify(`Failed to persist risk breach: ${error}`).catch(err => 
        logger.error('Failed to send risk breach persistence notification', { error: err })
      );
    }
  }
  
  /**
   * Get current risk summary for external systems
   */
  getRiskSummary(agents?: Map<string, AssetAgent>) {
    const agentsMap = agents || new Map();
    const riskCheck = this.performRiskCheck(agentsMap);
    
    return {
      canTrade: riskCheck.canTrade,
      riskLevel: riskCheck.riskLevel,
      metrics: riskCheck.metrics,
      breachCount: riskCheck.breaches.length,
      warningCount: riskCheck.warnings.length,
      checkId: riskCheck.checkId,
      timestamp: riskCheck.timestamp
    };
  }

  /**
   * Get risk history for analysis
   */
  getRiskHistory() {
    return [...this.riskHistory];
  }

  /**
   * Legacy method for backward compatibility
   */
  private async persistRiskVeto(reason: string, dayLossPct: number, openRiskPct: number): Promise<void> {
    logger.warn('⚠️ PORTFOLIO RISK: Legacy persistRiskVeto called', {
      reason,
      dayLossPct,
      openRiskPct,
      recommendation: 'Use new comprehensive risk checking system'
    });

    try {
      await prisma.rLDataset.create({
        data: {
          symbol: 'portfolio',
          featureVec: JSON.stringify({
            reason,
            dayLossPct,
            openRiskPct,
            maxDailyLoss: this.maxDailyLoss,
            maxOpenRisk: this.maxOpenRisk * 100,
            timestamp: new Date().toISOString(),
            legacyMethod: true
          }),
          action: 'blocked_risk_legacy',
          outcome: 0,
        }
      });

      logger.debug('📊 PORTFOLIO RISK: Legacy risk veto persisted', {
        reason,
        dayLossPct,
        openRiskPct
      });
    } catch (error) {
      logger.error('❌ PORTFOLIO RISK: Failed to persist legacy risk veto', { 
        error: error instanceof Error ? error.message : String(error),
        reason,
        dayLossPct,
        openRiskPct
      });
      await notify(`Failed to persist risk veto: ${error}`).catch(err => 
        logger.error('Failed to send legacy risk veto notification', { error: err })
      );
    }
  }
  
  /**
   * Enhanced recalculation with detailed logging
   */
  recalc(agents: Map<string, AssetAgent>) {
    const recalcStartTime = Date.now();
    
    // Calculate new metrics
    const previousEquity = this.equity;
    const previousDayPnl = this.dayPnl;
    const previousOpenRisk = this.openRiskPct;

    // Update values from agents
    this.openRiskPct = [...agents.values()].reduce((sum, agent) => sum + agent.risk.openRisk, 0);
    this.dayPnl = [...agents.values()].reduce((sum, agent) => sum + agent.risk.dayPnL, 0);
    this.equity = [...agents.values()].reduce((sum, agent) => sum + agent.risk.equity, 0);

    // Calculate changes
    const equityChange = this.equity - previousEquity;
    const dayPnlChange = this.dayPnl - previousDayPnl;
    const openRiskChange = this.openRiskPct - previousOpenRisk;

    const recalcTime = Date.now() - recalcStartTime;

    // Log portfolio recalculation
    logger.debug('🔄 PORTFOLIO RISK: Portfolio metrics recalculated', {
      agentCount: agents.size,
      previousMetrics: {
        equity: previousEquity,
        dayPnl: previousDayPnl,
        openRisk: previousOpenRisk
      },
      currentMetrics: {
        equity: this.equity,
        dayPnl: this.dayPnl,
        openRisk: this.openRiskPct
      },
      changes: {
        equity: equityChange,
        dayPnl: dayPnlChange,
        openRisk: openRiskChange
      },
      utilizationRatio: Math.max(
        Math.abs(this.dayPnl / this.equity) / this.maxDailyLoss,
        this.openRiskPct / this.maxOpenRisk
      ),
      recalcTime
    });

    // Log significant changes
    if (Math.abs(equityChange) > 50 || Math.abs(dayPnlChange) > 50 || Math.abs(openRiskChange) > 1) {
      logger.info('📈 PORTFOLIO RISK: Significant portfolio metrics change detected', {
        significantChanges: {
          equity: Math.abs(equityChange) > 50 ? equityChange : null,
          dayPnl: Math.abs(dayPnlChange) > 50 ? dayPnlChange : null,
          openRisk: Math.abs(openRiskChange) > 1 ? openRiskChange : null
        },
        totalEquity: this.equity,
        totalDayPnl: this.dayPnl,
        totalOpenRisk: this.openRiskPct
      });
    }
    
    // Persist updated equity to database
    this.updateEquity();
  }
  
  /**
   * Enhanced equity update with detailed logging
   */
  private async updateEquity() {
    const updateStartTime = Date.now();
    
    try {
      await prisma.accountState.upsert({
        where: { id: 1 },
        update: { equity: this.equity },
        create: { id: 1, equity: this.equity }
      });

      logger.debug('💾 PORTFOLIO RISK: Equity updated in database', {
        equity: this.equity,
        updateTime: Date.now() - updateStartTime,
        operation: 'upsert_success'
      });
    } catch (error) {
      logger.error('❌ PORTFOLIO RISK: Failed to update equity in database', { 
        equity: this.equity,
        error: error instanceof Error ? error.message : String(error),
        updateTime: Date.now() - updateStartTime
      });
      await notify(`Failed to update equity in DB: ${error}`).catch(err => 
        logger.error('Failed to send equity update notification', { error: err })
      );
    }
  }
  
  /**
   * Handles the closing of a position and updates equity in database
   */
  async closePosition() {
    const closeStartTime = Date.now();
    
    try {
    await prisma.accountState.upsert({
      where: { id: 1 },
      update: { equity: this.equity },
      create: { id: 1, equity: this.equity }
    });

      logger.debug('📊 PORTFOLIO RISK: Position close equity update completed', {
        equity: this.equity,
        updateTime: Date.now() - closeStartTime
      });
    } catch (error) {
      logger.error('❌ PORTFOLIO RISK: Failed to update equity after position close', {
        equity: this.equity,
        error: error instanceof Error ? error.message : String(error),
        updateTime: Date.now() - closeStartTime
      });
    }
  }
  
  /**
   * Cleans up resources when shutting down
   */
  destroy() {
    logger.info('🔄 PORTFOLIO RISK: Shutting down Portfolio Risk Manager', {
      riskHistoryLength: this.riskHistory.length,
      consecutiveWarnings: this.consecutiveWarnings
    });

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      logger.debug('✅ PORTFOLIO RISK: Risk limits refresh timer cleared');
    }
  }
} 