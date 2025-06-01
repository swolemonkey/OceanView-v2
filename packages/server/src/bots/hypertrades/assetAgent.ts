import { Perception, Candle } from './perception.js';
import { RiskManager } from './risk.js';
import { executeIdea } from './execution.js';
import type { Config } from './config.js';
import * as Indicators from './indicators/index.js';
import { BaseStrategy } from './strategies/baseStrategy.js';
import { SMCReversal } from './strategies/smcReversal.js';
import { TrendFollowMA as TrendFollowMAOld } from './strategies/trendFollow.js';
import { RangeBounce as RangeBounceOld } from './strategies/rangeBounce.js';
import { TrendFollowMA } from './strategies/trendFollowMA.js';
import { RangeBounce } from './strategies/rangeBounce.js';
import { passRR } from './utils/riskReward.js';
import type { DataFeed, Tick } from '../../feeds/interface.js';
import type { ExecutionEngine, Order } from '../../execution/interface.js';
import { SimEngine } from '../../execution/sim.js';
import { gate } from '../../rl/gatekeeper.js';
import { storeRLEntryId } from '../../botRunner/workers/hypertrades.js';
import { PortfolioRiskManager } from '../../risk/portfolioRisk.js';
import { createLogger } from '../../utils/logger.js';

// Create logger
const logger = createLogger('assetAgent');

// Global portfolio risk manager instance
let portfolioRisk: PortfolioRiskManager | null = null;
// Global collection of all agent instances
const allAgents = new Map<string, AssetAgent>();

// Define TradeIdea type to match what executeIdea expects
type TradeIdea = { 
  symbol: string; 
  side: 'buy' | 'sell'; 
  qty: number; 
  price: number;
  reason?: string;
};

// Type for decision output that can include a 'hold' action
type Decision = TradeIdea | {
  symbol: string;
  action: 'hold';
  reason: string;
};

export class AssetAgent {
  symbol: string;
  perception: Perception;
  risk: RiskManager;
  cfg: Config;
  indCache: Indicators.Default;
  strategies: BaseStrategy[] = [];
  private dataFeed: DataFeed;
  private executionEngine: ExecutionEngine;
  private tickHandler: (tick: Tick) => void;
  
  constructor(
    symbol: string, 
    cfg: Config, 
    botId: number, 
    versionId: number,
    dataFeed?: DataFeed,
    executionEngine?: ExecutionEngine
  ) {
    this.symbol = symbol;
    this.cfg = cfg;
    this.perception = new Perception();
    this.risk = new RiskManager(botId, cfg);
    this.indCache = new Indicators.Default();
    
    // store versionId inside risk for trade logging
    (this.risk as any).versionId = versionId;
    
    // Set execution engine (default to SimEngine if not provided)
    this.executionEngine = executionEngine || new SimEngine(botId);
    
    // Set data feed (will be set later if not provided)
    this.dataFeed = dataFeed as DataFeed;
    
    // Create tick handler for data feed
    this.tickHandler = (tick: Tick) => {
      this.onTick(tick.price, tick.timestamp);
    };
    
    // Subscribe to data feed if provided
    if (dataFeed) {
      dataFeed.subscribe(symbol, this.tickHandler);
    }
    
    // Use global strategy toggles directly instead of per-symbol toggles
    // Initialize strategies based on configuration
    if (cfg.strategyToggle.SMCReversal !== false) { // Default to true if not specified
      this.strategies.push(new SMCReversal(symbol));
    }
    
    if (cfg.strategyToggle.TrendFollowMA === true) {
      this.strategies.push(new TrendFollowMA(symbol));
    }
    
    if (cfg.strategyToggle.RangeBounce === true) {
      this.strategies.push(new RangeBounce(symbol));
    }
    
    logger.info(`Initialized strategies for ${symbol}: ${this.strategies.map(s => s.constructor.name).join(', ')}`);
    
    // Register this agent in the global collection
    allAgents.set(symbol, this);
    
    // Initialize portfolio risk manager if not already done
    if (!portfolioRisk) {
      portfolioRisk = new PortfolioRiskManager();
      portfolioRisk.init().catch(err => 
        logger.error(`Failed to initialize portfolio risk manager:`, { error: err })
      );
    }
  }

  // Method to set data feed after construction
  setDataFeed(dataFeed: DataFeed): void {
    // Unsubscribe from previous feed if exists
    if (this.dataFeed) {
      // Note: DataFeed interface doesn't have unsubscribe method,
      // but ideally we would unsubscribe here
    }
    
    this.dataFeed = dataFeed;
    dataFeed.subscribe(this.symbol, this.tickHandler);
  }
  
  // Method to set execution engine after construction
  setExecutionEngine(executionEngine: ExecutionEngine): void {
    this.executionEngine = executionEngine;
  }

  async onTick(price: number, ts: number) {
    this.perception.addTick(price, ts);
    this.risk.updateStops(price);
    
    // Get the last 2 candles for stop calculation
    const lastCandles = this.perception.last(2);
    if (lastCandles.length < 2) {
      logger.debug(`${this.symbol.toUpperCase()}: Not enough data yet, need at least 2 candles`);
      return; // Need at least 2 candles
    }
  }
  
  async onCandleClose(candle: Candle) {
    // Update the candle in perception
    this.perception.onCandleClose(candle);
    
    // Update indicator cache
    this.indCache.updateOnClose(candle.c);
    
    // Update portfolio risk metrics
    if (portfolioRisk) {
      portfolioRisk.recalc(allAgents);
      
      // Check portfolio-wide risk limits
      if (!portfolioRisk.canTrade()) {
        logger.info(`BLOCKED: Portfolio risk limits exceeded for ${this.symbol.toUpperCase()}`);
        logger.info(`Open risk: ${portfolioRisk.openRiskPct.toFixed(2)}%, Daily PnL: $${portfolioRisk.dayPnl.toFixed(2)}`);
        return;
      }
    }
    
    // Prepare strategy context
    const ctx = {
      perception: this.perception,
      ind: this.indCache,
      cfg: this.cfg
    };
    
    // Get first non-null trade idea from strategies
    let tradeIdea = null;
    for (const strategy of this.strategies) {
      tradeIdea = strategy.onCandle(candle, ctx);
      if (tradeIdea) break;
    }
    
    // If no trade idea, return
    if (!tradeIdea) {
      logger.debug(`DECISION: HOLD ${this.symbol.toUpperCase()} @ $${candle.c.toFixed(2)} | No trade signals`);
      return;
    }
    
    logger.info(`DECISION: ${tradeIdea.side.toUpperCase()} ${this.symbol.toUpperCase()} @ $${candle.c.toFixed(2)} | ${tradeIdea.reason}`);
    
    // Prepare feature vector for RL model
    const featureVec = [
      this.indCache.rsi14 || 50,
      this.indCache.adx14 || 25,
      (this.indCache.fastMA - this.indCache.slowMA) / candle.c,
      this.indCache.bbWidth || 0,
      0, // avgSent
      0, // avgOB
      tradeIdea.side === 'buy' ? 1 : 0
    ];
    
    // Score the trade idea with the gatekeeper
    let tradeScore = 0.5; // Default score
    let rlEntryId = 0;
    try {
      // Score the trade idea
      const scoreResult = await gate.scoreIdea({
        symbol: this.symbol,
        price: candle.c,
        rsi: this.indCache.rsi14,
        adx: this.indCache.adx14,
        volatility: this.indCache.bbWidth,
        recentTrend: (this.indCache.fastMA - this.indCache.slowMA) / candle.c,
        dayOfWeek: new Date().getDay(),
        hourOfDay: new Date().getHours(),
      }, tradeIdea.side);
      
      tradeScore = scoreResult.score;
      rlEntryId = scoreResult.id;
      
      // Store the RL entry ID for later update
      storeRLEntryId(this.symbol, Date.now(), rlEntryId);
      
      logger.info(`RL Score: ${tradeScore.toFixed(4)} for ${tradeIdea.side.toUpperCase()} ${this.symbol.toUpperCase()}`);
      
      // Veto the trade if score is below threshold
      if (tradeScore < this.cfg.gatekeeperThresh) {
        logger.info(`VETO: Trade vetoed by gatekeeper with score ${tradeScore.toFixed(4)} (threshold: ${this.cfg.gatekeeperThresh.toFixed(2)})`);
        return;
      }
    } catch (error) {
      logger.error('Error scoring trade idea with gatekeeper:', { error });
    }
    
    // Calculate position size
    const stopPrice = candle.c * 0.98; // Calculate a stop price 2% below current price
    const qty = this.risk.sizeTrade(stopPrice, candle.c);
    
    // Prepare full trade idea
    const fullIdea: TradeIdea = {
      symbol: this.symbol,
      side: tradeIdea.side,
      price: candle.c,
      qty
    };
    
    // Check risk-reward ratio
    if (!passRR(fullIdea.side, candle.c, candle.c * 0.98, candle.c * 1.02, 2.0)) {
      logger.info(`BLOCKED: Risk-reward ratio below threshold for ${this.symbol.toUpperCase()}`);
      return;
    }
    
    // Execute trade idea
    logger.info(`EXECUTING: ${tradeIdea.side.toUpperCase()} ${qty.toFixed(6)} ${this.symbol.toUpperCase()} @ $${candle.c.toFixed(2)}`);
    
    try {
      // Create execution order
      const order: Order = {
        symbol: this.symbol,
        side: tradeIdea.side,
        type: 'market',
        qty: qty,
        price: candle.c
      };
      
      // Execute order with retry
      const orderResult = await this.executeWithRetry(order);
      
      // Process the order result
      if (orderResult && orderResult.status === 'filled') {
        // Get the fill price from the order result
        const fill = orderResult.trades[0];
        
        // Update risk manager with new position
        this.risk.registerOrder(fill.side, fill.qty, fill.price, fill.price * 0.98);
        
        // Update the RL dataset with the PnL outcome
        if (rlEntryId) {
          await gate.updateOutcome(rlEntryId, 0); // Placeholder PnL, will be updated later
        }
        
        logger.info(`COMPLETED: ${order.side.toUpperCase()} ${fill.qty.toFixed(6)} ${this.symbol.toUpperCase()} @ $${fill.price.toFixed(2)} | PnL: $${this.risk.dayPnL.toFixed(2)}`);
      }
    } catch (error) {
      logger.error(`Error executing trade:`, { error, symbol: this.symbol, side: tradeIdea.side });
      if (this.risk.openRisk > this.cfg.riskPct) {
        logger.warn(`BLOCKED: Risk limits exceeded for ${this.symbol.toUpperCase()}. Open risk: ${this.risk.openRisk.toFixed(2)}%`);
      }
    }
  }
  
  /**
   * Execute an order with retry logic
   * @param order Order to execute
   * @param maxRetries Maximum number of retry attempts
   * @returns Promise resolving to order result
   */
  private async executeWithRetry(order: Order, maxRetries = 3): Promise<any> {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.executionEngine.place(order);
      } catch (error) {
        lastError = error;
        
        // Check if portfolio risk still allows trading
        if (portfolioRisk && !portfolioRisk.canTrade()) {
          throw new Error('Portfolio risk limits exceeded, aborting execution');
        }
        
        // Delay before retry
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        logger.debug(`Retry attempt ${attempt + 1} for ${order.side} ${order.symbol} after ${delay/1000}s delay`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
  
  /**
   * Close all open positions at current price
   * @param currentPrice Current market price
   * @returns Promise resolving to position close result
   */
  async closePositions(currentPrice: number): Promise<void> {
    if (this.risk.positions.length > 0) {
      const positionQty = this.risk.positions[0].qty;
      const positionSide = this.risk.positions[0].side;
      const closeSide = positionSide === 'buy' ? 'sell' : 'buy';
      
      const order: Order = {
        symbol: this.symbol,
        side: closeSide as 'buy' | 'sell',
        type: 'market',
        qty: Math.abs(positionQty),
        price: currentPrice
      };
      
      try {
        const result = await this.executionEngine.place(order);
        if (result && typeof result === 'object' && 'status' in result && result.status === 'filled' && 'trades' in result && Array.isArray(result.trades)) {
          const fill = result.trades[0];
          const tradePnL = await this.risk.closePosition(fill.qty, fill.price, fill.fee || 0);
          logger.info(`Closed position: ${tradePnL.toFixed(2)} PnL`);
        }
      } catch (error) {
        logger.error(`Error closing position:`, { error, symbol: this.symbol });
      }
    }
  }
  
  /**
   * Check if portfolio risk allows trading again after being halted
   */
  async checkRiskResumption(): Promise<void> {
    if (portfolioRisk && portfolioRisk.canTrade()) {
      logger.info(`Trading can resume - Portfolio risk metrics within limits`);
      logger.info(`Open risk: ${portfolioRisk.openRiskPct.toFixed(2)}%, Daily PnL: $${portfolioRisk.dayPnl.toFixed(2)}`);
    }
  }
} 