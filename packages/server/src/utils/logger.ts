import winston from 'winston';
import { randomUUID } from 'crypto';

// Enhanced logging interfaces for structured data
export interface TradeContext {
  tradeId?: string;
  symbol: string;
  side?: 'buy' | 'sell';
  qty?: number;
  price?: number;
  reason?: string;
  strategyName?: string;
  versionId?: number;
  timestamp?: number;
}

export interface PortfolioContext {
  totalEquity?: number;
  totalPnL?: number;
  openRisk?: number;
  dayPnL?: number;
  positionCount?: number;
  canTrade?: boolean;
  reason?: string;
}

export interface ExecutionContext {
  orderId?: string;
  tradeId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  executionTime?: number;
  slippage?: number;
  fee?: number;
  exchange?: string;
  status?: string;
  attempt?: number;
  maxAttempts?: number;
}

export interface DatabaseContext {
  operation: string;
  table?: string;
  recordId?: string | number;
  tradeId?: string;
  attempt?: number;
  maxAttempts?: number;
  executionTime?: number;
  transactionId?: string;
}

export interface RiskContext {
  symbol: string;
  tradeId?: string;
  currentPrice: number;
  stopPrice?: number;
  targetPrice?: number;
  riskReward?: number;
  threshold?: number;
  atr?: number;
  positionSize?: number;
  riskAmount?: number;
  passed?: boolean;
  reason?: string;
}

// Trade ID generator and tracker
class TradeIdManager {
  private static instance: TradeIdManager;
  private tradeIdMap = new Map<string, string>(); // symbol -> current trade ID

  static getInstance(): TradeIdManager {
    if (!TradeIdManager.instance) {
      TradeIdManager.instance = new TradeIdManager();
    }
    return TradeIdManager.instance;
  }

  generateTradeId(symbol: string, side: string): string {
    const tradeId = `${symbol}_${side}_${Date.now()}_${randomUUID().slice(0, 8)}`;
    this.tradeIdMap.set(`${symbol}_${side}`, tradeId);
    return tradeId;
  }

  getCurrentTradeId(symbol: string, side: string): string | undefined {
    return this.tradeIdMap.get(`${symbol}_${side}`);
  }

  clearTradeId(symbol: string, side: string): void {
    this.tradeIdMap.delete(`${symbol}_${side}`);
  }

  getAllActiveTradeIds(): Map<string, string> {
    return new Map(this.tradeIdMap);
  }
}

// Enhanced logger with structured logging capabilities
export class EnhancedLogger {
  private logger: any;
  private context: string;
  private tradeIdManager: TradeIdManager;

  constructor(context: string) {
    this.context = context;
    this.tradeIdManager = TradeIdManager.getInstance();
    
    const loggerConfig = {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss.SSS'
        }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
      ),
      defaultMeta: { service: 'oceanview', context: this.context },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, context, tradeId, symbol, ...rest }) => {
              const tradeInfo = tradeId ? `[${tradeId}]` : '';
              const symbolInfo = symbol ? `[${symbol}]` : '';
              const restStr = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
              return `[${timestamp}] [${context}]${tradeInfo}${symbolInfo} ${level}: ${message}${restStr}`;
            })
          ),
        }),
      ],
    };

    this.logger = winston.createLogger(loggerConfig);
  }

  // Standard logging methods with enhanced context
  debug(message: string, meta: any = {}) {
    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(message, { ...meta, context: this.context });
    }
  }

  info(message: string, meta: any = {}) {
    this.logger.info(message, { ...meta, context: this.context });
  }

  warn(message: string, meta: any = {}) {
    this.logger.warn(message, { ...meta, context: this.context });
  }

  error(message: string, meta: any = {}) {
    this.logger.error(message, { ...meta, context: this.context });
  }

  // Specialized logging methods for execution pipeline
  
  /**
   * Log trade signal generation
   */
  logTradeSignal(
    symbol: string, 
    side: 'buy' | 'sell', 
    price: number, 
    strategyName: string, 
    reason: string,
    context: Partial<TradeContext> = {}
  ): string {
    const tradeId = this.tradeIdManager.generateTradeId(symbol, side);
    
    this.info('🔍 TRADE SIGNAL GENERATED', {
      tradeId,
      symbol,
      side: side.toUpperCase(),
      price: price.toFixed(4),
      strategy: strategyName,
      reason,
      timestamp: Date.now(),
      ...context
    });
    
    return tradeId;
  }

  /**
   * Log portfolio risk checks
   */
  logPortfolioRisk(symbol: string, riskData: PortfolioContext, tradeId?: string) {
    this.info('📊 PORTFOLIO RISK CHECK', {
      tradeId,
      symbol,
             totalEquity: riskData.totalEquity?.toFixed(2),
      totalPnL: riskData.totalPnL?.toFixed(2),
      openRisk: riskData.openRisk?.toFixed(2),
      dayPnL: riskData.dayPnL?.toFixed(2),
      positionCount: riskData.positionCount,
      canTrade: riskData.canTrade,
      reason: riskData.reason,
      timestamp: Date.now()
    });
  }

  /**
   * Log individual risk checks (RR, ATR, etc.)
   */
  logRiskCheck(symbolOrRiskData: string | RiskContext, detailedRiskData?: any) {
    // Handle both old and new calling patterns
    if (typeof symbolOrRiskData === 'string') {
      // New calling pattern: logRiskCheck(symbol, detailedRiskData)
      const symbol = symbolOrRiskData;
      const data = detailedRiskData;
      
      this.info(`🎯 COMPREHENSIVE RISK CHECK`, {
        symbol,
        metrics: data?.metrics,
        breaches: data?.breaches?.length || 0,
        warnings: data?.warnings?.length || 0,
        riskLevel: data?.riskLevel,
        canTrade: data?.canTrade,
        checkId: data?.checkId,
        timestamp: Date.now()
      });
    } else {
      // Old calling pattern: logRiskCheck(riskData)
      const riskData = symbolOrRiskData;
      const status = riskData.passed ? '✅ PASS' : '❌ FAIL';
      const riskType = riskData.riskReward ? 'RISK-REWARD' : 'RISK';
      
      this.info(`🎯 ${riskType} CHECK ${status}`, {
        tradeId: riskData.tradeId,
        symbol: riskData.symbol,
        currentPrice: riskData.currentPrice?.toFixed(4),
        stopPrice: riskData.stopPrice?.toFixed(4),
        targetPrice: riskData.targetPrice?.toFixed(4),
        riskReward: riskData.riskReward?.toFixed(3),
        threshold: riskData.threshold?.toFixed(3),
        atr: riskData.atr?.toFixed(4),
        positionSize: riskData.positionSize?.toFixed(6),
        riskAmount: riskData.riskAmount?.toFixed(2),
        passed: riskData.passed,
        reason: riskData.reason,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Log order placement
   */
  logOrderPlacement(executionData: ExecutionContext) {
    this.info('📤 ORDER PLACEMENT', {
      orderId: executionData.orderId,
      tradeId: executionData.tradeId,
      symbol: executionData.symbol,
      side: executionData.side.toUpperCase(),
      qty: executionData.qty.toFixed(6),
      price: executionData.price.toFixed(4),
      exchange: executionData.exchange || 'unknown',
      attempt: executionData.attempt || 1,
      maxAttempts: executionData.maxAttempts || 3,
      timestamp: Date.now()
    });
  }

  /**
   * Log order execution result
   */
  logOrderExecution(executionData: ExecutionContext & { success: boolean; fillPrice?: number; fillQty?: number }) {
    const status = executionData.success ? '✅ SUCCESS' : '❌ FAILED';
    
    this.info(`🔄 ORDER EXECUTION ${status}`, {
      orderId: executionData.orderId,
      tradeId: executionData.tradeId,
      symbol: executionData.symbol,
      side: executionData.side.toUpperCase(),
      requestedQty: executionData.qty.toFixed(6),
      requestedPrice: executionData.price.toFixed(4),
      fillQty: executionData.fillQty?.toFixed(6),
      fillPrice: executionData.fillPrice?.toFixed(4),
      slippage: executionData.slippage?.toFixed(4),
      fee: executionData.fee?.toFixed(4),
      executionTime: executionData.executionTime,
      exchange: executionData.exchange,
      status: executionData.status,
      success: executionData.success,
      timestamp: Date.now()
    });
  }

  /**
   * Log database operations
   */
  logDatabaseOperation(dbData: DatabaseContext & { success: boolean; error?: string }) {
    const status = dbData.success ? '✅ SUCCESS' : '❌ FAILED';
    
    this.info(`💾 DATABASE OPERATION ${status}`, {
      operation: dbData.operation,
      table: dbData.table,
      recordId: dbData.recordId,
      tradeId: dbData.tradeId,
      transactionId: dbData.transactionId,
      attempt: dbData.attempt || 1,
      maxAttempts: dbData.maxAttempts || 3,
      executionTime: dbData.executionTime,
      success: dbData.success,
      error: dbData.error,
      timestamp: Date.now()
    });
  }

  /**
   * Log trade verification
   */
  logTradeVerification(
    tradeId: string, 
    symbol: string, 
    verified: boolean, 
    details: any = {}
  ) {
    const status = verified ? '✅ VERIFIED' : '❌ VERIFICATION FAILED';
    
    this.info(`🔍 TRADE VERIFICATION ${status}`, {
      tradeId,
      symbol,
      verified,
      ...details,
      timestamp: Date.now()
    });
  }

  /**
   * Log trade lifecycle events (entry, exit, etc.)
   */
  logTradeLifecycle(
    phase: 'ENTRY' | 'EXIT' | 'STOP' | 'TARGET' | 'CANCELLED',
    tradeData: TradeContext & { pnl?: number; duration?: number }
  ) {
    const emoji = {
      'ENTRY': '🚀',
      'EXIT': '🏁',
      'STOP': '🛑',
      'TARGET': '🎯',
      'CANCELLED': '❌'
    };

    this.info(`${emoji[phase]} TRADE ${phase}`, {
      tradeId: tradeData.tradeId,
      symbol: tradeData.symbol,
      side: tradeData.side?.toUpperCase(),
      qty: tradeData.qty?.toFixed(6),
      price: tradeData.price?.toFixed(4),
      pnl: tradeData.pnl?.toFixed(2),
      duration: tradeData.duration,
      reason: tradeData.reason,
      strategy: tradeData.strategyName,
      versionId: tradeData.versionId,
      timestamp: Date.now()
    });
  }

  /**
   * Log execution pipeline metrics
   */
  logExecutionMetrics(
    symbol: string,
    metrics: {
      signalsGenerated?: number;
      signalsExecuted?: number;
      successRate?: number;
      avgExecutionTime?: number;
      totalPnL?: number;
      tradeCount?: number;
    }
  ) {
    this.info('📈 EXECUTION METRICS', {
      symbol,
      signalsGenerated: metrics.signalsGenerated,
      signalsExecuted: metrics.signalsExecuted,
      successRate: metrics.successRate?.toFixed(2),
      avgExecutionTime: metrics.avgExecutionTime?.toFixed(0),
      totalPnL: metrics.totalPnL?.toFixed(2),
      tradeCount: metrics.tradeCount,
      timestamp: Date.now()
    });
  }

  /**
   * Get current trade ID for a symbol/side
   */
  getCurrentTradeId(symbol: string, side: string): string | undefined {
    return this.tradeIdManager.getCurrentTradeId(symbol, side);
  }

  /**
   * Clear trade ID when trade is complete
   */
  clearTradeId(symbol: string, side: string): void {
    this.tradeIdManager.clearTradeId(symbol, side);
  }
}

// Create a logger configuration for backward compatibility
const loggerConfig = {
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'oceanview' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, service, ...rest }) => {
          return `[${timestamp}] [${service}] ${level}: ${message} ${Object.keys(rest).length ? JSON.stringify(rest, null, 2) : ''}`;
        })
      ),
    }),
  ],
};

// Create the legacy logger
const logger = winston.createLogger(loggerConfig);

// Enhanced logger factory
export const createLogger = (context: string): EnhancedLogger => {
  return new EnhancedLogger(context);
};

// Legacy logger factory for backward compatibility
export const createSimpleLogger = (context: string) => {
  const contextLogger = {
    debug: (message: string, meta: any = {}) => {
      if (process.env.NODE_ENV !== 'production') {
        logger.debug(message, { ...meta, context });
      }
    },
    info: (message: string, meta: any = {}) => {
      logger.info(message, { ...meta, context });
    },
    warn: (message: string, meta: any = {}) => {
      logger.warn(message, { ...meta, context });
    },
    error: (message: string, meta: any = {}) => {
      logger.error(message, { ...meta, context });
    }
  };
  
  return contextLogger;
};

// Export trade ID manager for external use
export const getTradeIdManager = () => TradeIdManager.getInstance();

export default logger; 