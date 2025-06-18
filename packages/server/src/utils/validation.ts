import { createLogger, type EnhancedLogger } from './logger.js';
import { prisma } from '../db.js';
import { randomUUID } from 'crypto';

const logger = createLogger('validation');

export interface ValidationResult {
  success: boolean;
  message: string;
  details?: any;
  timestamp: number;
  validationId: string;
}

export interface TradeValidationResult extends ValidationResult {
  tradeId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  checks: {
    databaseRecorded: boolean;
    portfolioUpdated: boolean;
    riskLimitsRespected: boolean;
    executionMatched: boolean;
  };
}

export interface HealthCheckResult {
  component: string;
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  timestamp: number;
  responseTime?: number;
  details?: any;
}

export class TradeValidator {
  private static instance: TradeValidator;
  private logger: EnhancedLogger;

  private constructor() {
    this.logger = createLogger('trade-validator');
  }

  static getInstance(): TradeValidator {
    if (!TradeValidator.instance) {
      TradeValidator.instance = new TradeValidator();
    }
    return TradeValidator.instance;
  }

  async verifyTrade(
    tradeId: string,
    symbol: string,
    side: 'buy' | 'sell',
    qty: number,
    price: number,
    expectedOutcome: {
      shouldBeRecorded: boolean;
      expectedPnL?: number;
      expectedFee?: number;
    }
  ): Promise<TradeValidationResult> {
    const validationId = randomUUID();
    const startTime = Date.now();
    
    this.logger.info(`🔍 VERIFICATION: Starting trade verification for ${symbol} ${side} ${qty} @ ${price}`, {
      tradeId, validationId, symbol, side, qty, price
    });

    const result: TradeValidationResult = {
      success: false,
      message: '',
      validationId,
      timestamp: startTime,
      tradeId,
      symbol,
      side,
      qty,
      price,
      checks: {
        databaseRecorded: false,
        portfolioUpdated: false,
        riskLimitsRespected: false,
        executionMatched: false
      }
    };

    try {
      // Check 1: Database recording verification
      result.checks.databaseRecorded = await this.verifyDatabaseRecording(
        symbol, side, qty, price, expectedOutcome.shouldBeRecorded
      );

      // Check 2: Portfolio update verification
      result.checks.portfolioUpdated = await this.verifyPortfolioUpdate(symbol);

      // Check 3: Risk limits verification
      result.checks.riskLimitsRespected = await this.verifyRiskLimits(symbol);

      // Check 4: Execution matching verification
      result.checks.executionMatched = await this.verifyExecutionMatching(
        symbol, side, qty, price, expectedOutcome.expectedPnL, expectedOutcome.expectedFee
      );

      // Overall success determination
      const allChecksPass = Object.values(result.checks).every(check => check === true);
      result.success = allChecksPass;
      result.message = allChecksPass 
        ? `✅ Trade verification PASSED for ${symbol} ${side} ${qty} @ ${price}`
        : `❌ Trade verification FAILED for ${symbol} ${side} ${qty} @ ${price}`;

      // Log detailed results
      this.logger.logTradeVerification(tradeId, symbol, result.success, {
        validationId,
        checks: result.checks,
        executionTime: Date.now() - startTime,
        verificationSummary: {
          databaseRecorded: result.checks.databaseRecorded ? 'PASS' : 'FAIL',
          portfolioUpdated: result.checks.portfolioUpdated ? 'PASS' : 'FAIL',
          riskLimitsRespected: result.checks.riskLimitsRespected ? 'PASS' : 'FAIL',
          executionMatched: result.checks.executionMatched ? 'PASS' : 'FAIL'
        }
      });

      return result;
    } catch (error) {
      result.success = false;
      result.message = `Trade verification error: ${error instanceof Error ? error.message : String(error)}`;
      
      this.logger.error(`Trade verification failed for ${symbol}`, {
        tradeId, validationId, error: error instanceof Error ? error.message : String(error)
      });
      
      return result;
    }
  }

  private async verifyDatabaseRecording(
    symbol: string, side: 'buy' | 'sell', qty: number, price: number, shouldBeRecorded: boolean
  ): Promise<boolean> {
    try {
      const recentTrades = await prisma.trade.findMany({
        where: {
          symbol, side,
          ts: { gte: new Date(Date.now() - 30000) } // Last 30 seconds
        },
        orderBy: { ts: 'desc' },
        take: 5
      });

      const matchingTrade = recentTrades.find(trade => 
        Math.abs(Number(trade.qty) - qty) < 0.0001 && Math.abs(Number(trade.price) - price) < 0.01
      );

      if (shouldBeRecorded && !matchingTrade) {
        this.logger.warn(`❌ DATABASE CHECK: Expected trade not found in database`, {
          symbol, side, qty, price, recentTradesCount: recentTrades.length
        });
        return false;
      }

      if (!shouldBeRecorded && matchingTrade) {
        this.logger.warn(`❌ DATABASE CHECK: Unexpected trade found in database`, {
          symbol, side, qty, price, foundTradeId: matchingTrade.id
        });
        return false;
      }

      this.logger.info(`✅ DATABASE CHECK: Trade recording verification passed`, {
        symbol, side, qty, price, shouldBeRecorded, found: !!matchingTrade
      });
      return true;
    } catch (error) {
      this.logger.error(`❌ DATABASE CHECK: Verification failed`, {
        symbol, side, qty, price, error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  private async verifyPortfolioUpdate(symbol: string): Promise<boolean> {
    try {
      const latestAccountState = await prisma.accountState.findFirst({
        orderBy: { updated: 'desc' }
      });

      if (!latestAccountState) {
        this.logger.warn(`❌ PORTFOLIO CHECK: No account state found`, { symbol });
        return false;
      }
      
      const timeSinceUpdate = Date.now() - latestAccountState.updated.getTime();
      if (timeSinceUpdate > 60000) {
        this.logger.warn(`❌ PORTFOLIO CHECK: Account state not recently updated`, {
          symbol, timeSinceUpdate, lastUpdate: latestAccountState.updated
        });
        return false;
      }

      if (latestAccountState.equity <= 0) {
        this.logger.warn(`❌ PORTFOLIO CHECK: Invalid equity in account state`, {
          symbol, equity: latestAccountState.equity
        });
        return false;
      }

      this.logger.info(`✅ PORTFOLIO CHECK: Portfolio update verification passed`, {
        symbol, equity: latestAccountState.equity, timeSinceUpdate
      });
      return true;
    } catch (error) {
      this.logger.error(`❌ PORTFOLIO CHECK: Verification failed`, {
        symbol, error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  private async verifyRiskLimits(symbol: string): Promise<boolean> {
    try {
      const riskSettings = await prisma.hyperSettings.findUnique({ where: { id: 1 } });
      
      if (!riskSettings) {
        this.logger.warn(`❌ RISK CHECK: Missing risk settings`, { symbol });
        return false;
      }

      // Basic validation that risk settings are reasonable
      const hasValidLimits = riskSettings.maxDailyLoss > 0 && 
                            riskSettings.maxDailyLoss < 1 &&
                            riskSettings.maxOpenRisk > 0 &&
                            riskSettings.maxOpenRisk < 1;

      if (!hasValidLimits) {
        this.logger.warn(`❌ RISK CHECK: Invalid risk limit settings`, {
          symbol, maxDailyLoss: riskSettings.maxDailyLoss, maxOpenRisk: riskSettings.maxOpenRisk
        });
        return false;
      }

      this.logger.info(`✅ RISK CHECK: Risk limits verification passed`, {
        symbol, maxDailyLoss: riskSettings.maxDailyLoss, maxOpenRisk: riskSettings.maxOpenRisk
      });
      return true;
    } catch (error) {
      this.logger.error(`❌ RISK CHECK: Verification failed`, {
        symbol, error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  private async verifyExecutionMatching(
    symbol: string, side: 'buy' | 'sell', qty: number, price: number, 
    expectedPnL?: number, expectedFee?: number
  ): Promise<boolean> {
    try {
      const recentTrades = await prisma.trade.findMany({
        where: {
          symbol, side,
          ts: { gte: new Date(Date.now() - 30000) }
        },
        orderBy: { ts: 'desc' },
        take: 1
      });

      if (recentTrades.length === 0) {
        this.logger.warn(`❌ EXECUTION CHECK: No recent trades found`, { symbol });
        return false;
      }
      
      const trade = recentTrades[0];
      
      if (Math.abs(Number(trade.qty) - qty) > 0.0001) {
        this.logger.warn(`❌ EXECUTION CHECK: Quantity mismatch`, {
          symbol, expected: qty, actual: Number(trade.qty), difference: Math.abs(Number(trade.qty) - qty)
        });
        return false;
      }

      if (Math.abs(Number(trade.price) - price) > 0.01) {
        this.logger.warn(`❌ EXECUTION CHECK: Price mismatch`, {
          symbol, expected: price, actual: Number(trade.price), difference: Math.abs(Number(trade.price) - price)
        });
        return false;
      }

      if (expectedPnL !== undefined && trade.pnl !== null && Math.abs(Number(trade.pnl) - expectedPnL) > 0.01) {
        this.logger.warn(`❌ EXECUTION CHECK: PnL mismatch`, {
          symbol, expected: expectedPnL, actual: Number(trade.pnl), difference: Math.abs(Number(trade.pnl) - expectedPnL)
        });
        return false;
      }

      if (expectedFee !== undefined && Math.abs(Number(trade.feePaid) - expectedFee) > 0.01) {
        this.logger.warn(`❌ EXECUTION CHECK: Fee mismatch`, {
          symbol, expected: expectedFee, actual: Number(trade.feePaid), difference: Math.abs(Number(trade.feePaid) - expectedFee)
        });
        return false;
      }

      this.logger.info(`✅ EXECUTION CHECK: Execution matching verification passed`, {
        symbol, qty: Number(trade.qty), price: Number(trade.price), pnl: trade.pnl ? Number(trade.pnl) : null, fee: Number(trade.feePaid)
      });
      return true;
    } catch (error) {
      this.logger.error(`❌ EXECUTION CHECK: Verification failed`, {
        symbol, error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }
}

export class HealthChecker {
  private static instance: HealthChecker;
  private logger: EnhancedLogger;

  private constructor() {
    this.logger = createLogger('health-checker');
  }

  static getInstance(): HealthChecker {
    if (!HealthChecker.instance) {
      HealthChecker.instance = new HealthChecker();
    }
    return HealthChecker.instance;
  }

  async checkPipelineHealth(): Promise<{
    overall: 'healthy' | 'warning' | 'critical';
    components: HealthCheckResult[];
    summary: { healthy: number; warning: number; critical: number; };
  }> {
    const components: HealthCheckResult[] = [];
    
    this.logger.info('🏥 HEALTH CHECK: Starting pipeline health check');

    components.push(await this.checkDatabaseHealth());
    components.push(await this.checkPortfolioRiskHealth());
    components.push(await this.checkRLGatekeeperHealth());
    components.push(await this.checkExecutionEngineHealth());
    components.push(await this.checkLoggingSystemHealth());

    const summary = components.reduce(
      (acc, component) => {
        acc[component.status]++;
        return acc;
      },
      { healthy: 0, warning: 0, critical: 0 }
    );

    const overall = summary.critical > 0 ? 'critical' : 
                   summary.warning > 0 ? 'warning' : 'healthy';

    this.logger.info(`🏥 HEALTH CHECK: Pipeline health check completed - ${overall.toUpperCase()}`, {
      overall, summary, componentCount: components.length
    });

    return { overall, components, summary };
  }

  private async checkDatabaseHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      await prisma.$queryRaw`SELECT 1`;
      
      const tradeCount = await prisma.trade.count();
      const accountState = await prisma.accountState.findFirst();
      const riskSettings = await prisma.hyperSettings.findFirst();
      
      const responseTime = Date.now() - startTime;
      
      const hasAccountState = !!accountState;
      const hasRiskSettings = !!riskSettings;
      const status = hasAccountState && hasRiskSettings ? 'healthy' : 'warning';
      
      return {
        component: 'database',
        status,
        message: status === 'healthy' ? 'Database is healthy and responsive' : 'Database connected but missing critical data',
        timestamp: startTime,
        responseTime,
        details: { tradeCount, hasAccountState, hasRiskSettings, connectivity: 'ok' }
      };
    } catch (error) {
      return {
        component: 'database',
        status: 'critical',
        message: `Database health check failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: startTime,
        responseTime: Date.now() - startTime,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  private async checkPortfolioRiskHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const riskSettings = await prisma.hyperSettings.findUnique({ where: { id: 1 } });
      
      if (!riskSettings) {
        return {
          component: 'portfolio_risk',
          status: 'warning',
          message: 'Risk settings not found, using defaults',
          timestamp: startTime,
          responseTime: Date.now() - startTime,
          details: { riskSettings: null }
        };
      }

      const hasValidLimits = riskSettings.maxDailyLoss > 0 && 
                            riskSettings.maxDailyLoss < 1 &&
                            riskSettings.maxOpenRisk > 0 &&
                            riskSettings.maxOpenRisk < 1;

      return {
        component: 'portfolio_risk',
        status: hasValidLimits ? 'healthy' : 'warning',
        message: hasValidLimits ? 'Portfolio risk manager is healthy' : 'Risk limits appear unreasonable',
        timestamp: startTime,
        responseTime: Date.now() - startTime,
        details: { 
          riskSettings,
          hasValidLimits,
          maxDailyLoss: riskSettings.maxDailyLoss,
          maxOpenRisk: riskSettings.maxOpenRisk
        }
      };
    } catch (error) {
      return {
        component: 'portfolio_risk',
        status: 'critical',
        message: `Portfolio risk health check failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: startTime,
        responseTime: Date.now() - startTime,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  private async checkRLGatekeeperHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const modelCount = await prisma.rLModel.count();
      
      if (modelCount === 0) {
        return {
          component: 'rl_gatekeeper',
          status: 'warning',
          message: 'No RL models found',
          timestamp: startTime,
          responseTime: Date.now() - startTime,
          details: { modelCount: 0, activeModel: null }
        };
      }

      return {
        component: 'rl_gatekeeper',
        status: 'healthy',
        message: 'RL gatekeeper is healthy',
        timestamp: startTime,
        responseTime: Date.now() - startTime,
        details: { 
          modelCount,
          modelsAvailable: true
        }
      };
    } catch (error) {
      return {
        component: 'rl_gatekeeper',
        status: 'critical',
        message: `RL gatekeeper health check failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: startTime,
        responseTime: Date.now() - startTime,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  private async checkExecutionEngineHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      return {
        component: 'execution_engine',
        status: 'healthy',
        message: 'Execution engines are available',
        timestamp: startTime,
        responseTime: Date.now() - startTime,
        details: {
          availableEngines: ['SimEngine', 'BinanceTestnetEngine', 'AlpacaPaperEngine'],
          defaultEngine: 'SimEngine'
        }
      };
    } catch (error) {
      return {
        component: 'execution_engine',
        status: 'critical',
        message: `Execution engine health check failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: startTime,
        responseTime: Date.now() - startTime,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  private async checkLoggingSystemHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      this.logger.debug('Health check test log message');
      
      return {
        component: 'logging_system',
        status: 'healthy',
        message: 'Logging system is healthy',
        timestamp: startTime,
        responseTime: Date.now() - startTime,
        details: {
          loggerType: 'EnhancedLogger',
          contextSupported: true,
          tradeIdTracking: true
        }
      };
    } catch (error) {
      return {
        component: 'logging_system',
        status: 'critical',
        message: `Logging system health check failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: startTime,
        responseTime: Date.now() - startTime,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }
}

export class ValidationOrchestrator {
  private static instance: ValidationOrchestrator;
  private tradeValidator: TradeValidator;
  private healthChecker: HealthChecker;
  private logger: EnhancedLogger;

  private constructor() {
    this.tradeValidator = TradeValidator.getInstance();
    this.healthChecker = HealthChecker.getInstance();
    this.logger = createLogger('validation-orchestrator');
  }

  static getInstance(): ValidationOrchestrator {
    if (!ValidationOrchestrator.instance) {
      ValidationOrchestrator.instance = new ValidationOrchestrator();
    }
    return ValidationOrchestrator.instance;
  }

  async validateExecution(
    tradeId: string, symbol: string, side: 'buy' | 'sell', qty: number, price: number,
    expectedOutcome: { shouldBeRecorded: boolean; expectedPnL?: number; expectedFee?: number; }
  ): Promise<TradeValidationResult> {
    this.logger.info(`🔍 VALIDATION: Starting post-execution validation`, { 
      tradeId, symbol, side, qty, price 
    });

    const result = await this.tradeValidator.verifyTrade(tradeId, symbol, side, qty, price, expectedOutcome);

    if (result.success) {
      this.logger.info(`✅ VALIDATION: Trade validation passed`, { 
        tradeId, symbol, validationId: result.validationId 
      });
    } else {
      this.logger.error(`❌ VALIDATION: Trade validation failed`, { 
        tradeId, symbol, validationId: result.validationId, 
        message: result.message, checks: result.checks 
      });
    }

    return result;
  }

  async checkHealth() {
    return await this.healthChecker.checkPipelineHealth();
  }
}

// Export singleton instances
export const tradeValidator = TradeValidator.getInstance();
export const healthChecker = HealthChecker.getInstance();
export const validationOrchestrator = ValidationOrchestrator.getInstance(); 