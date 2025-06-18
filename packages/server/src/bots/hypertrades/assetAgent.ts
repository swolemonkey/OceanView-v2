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
import { passRR, passRRDynamic } from './utils/riskReward.js';
import type { DataFeed, Tick } from '../../feeds/interface.js';
import type { ExecutionEngine, Order } from '../../execution/interface.js';
import { SimEngine } from '../../execution/sim.js';
import { placeWithOCO } from '../../execution/ocoWrapper.js';
import { gate } from '../../rl/gatekeeper.js';
import { storeRLEntryId } from '../../botRunner/workers/hypertrades.js';
import { PortfolioRiskManager } from '../../risk/portfolioRisk.js';
import { createLogger } from '../../utils/logger.js';
import { prisma } from '../../db.js';

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
  stop?: number;
  target?: number;
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
    this.risk.updateAllStops();
    
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
        logger.warn(
          'VETO-PORTFOLIO limits exceeded',
          { open: portfolioRisk.openRiskPct, loss: portfolioRisk.dayPnl < 0 ? Math.abs(portfolioRisk.dayPnl) / portfolioRisk.equity : 0 }
        );
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
    let tradeIdea: any = null;
    logger.info(`🔍 STRATEGY CHECK: Testing ${this.strategies.length} strategies for ${this.symbol}`);
    
    for (let i = 0; i < this.strategies.length; i++) {
      const strategy = this.strategies[i];
      const idea = strategy.onCandle(candle, ctx);
      const strategyName = strategy.constructor.name;
      
      if (idea) {
        logger.info(`✅ SIGNAL: ${strategyName} generated ${idea.side.toUpperCase()} signal for ${this.symbol} @ ${candle.c.toFixed(2)} | Reason: ${idea.reason || 'N/A'}`);
        tradeIdea = idea;
        break;
      } else {
        logger.debug(`⚪ NO SIGNAL: ${strategyName} returned null for ${this.symbol}`);
      }
    }

    // If no trade idea, return
    if (!tradeIdea) {
      logger.debug(`DECISION: HOLD ${this.symbol.toUpperCase()} @ $${candle.c.toFixed(2)} | No trade signals from any strategy`);
      return;
    }
    
    logger.info(`🎯 TRADE IDEA: ${tradeIdea.side.toUpperCase()} ${this.symbol} @ ${candle.c.toFixed(2)} | Reason: ${tradeIdea.reason || 'N/A'}`);
    
    // Log current market conditions for context
    logger.info(`📊 MARKET CONDITIONS: RSI=${this.indCache.rsi14?.toFixed(2) || 'N/A'}, ADX=${this.indCache.adx14?.toFixed(2) || 'N/A'}, ATR=${this.indCache.atr14?.toFixed(2) || 'N/A'}`);
    logger.info(`📈 PRICE ACTION: O=${candle.o.toFixed(2)}, H=${candle.h.toFixed(2)}, L=${candle.l.toFixed(2)}, C=${candle.c.toFixed(2)}`);
    
    // Check if this is a reversal (buy after sell or sell after buy)
    const lastTrades = await prisma.rLDataset.findMany({
      where: { symbol: this.symbol },
      orderBy: { ts: 'desc' },
      take: 3
    });
    
    if (lastTrades.length > 0) {
      const recentActions = lastTrades.map(t => t.action).join(' -> ');
      logger.info(`📚 RECENT ACTIONS: ${recentActions}`);
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
        
        // Persist the skipped trade to the database
        await prisma.rLDataset.create({
          data: {
            symbol: this.symbol,
            featureVec: JSON.stringify(featureVec),
            action: 'skip',
            outcome: 0,
            gateScore: tradeScore,
            strategyVersionId: (this.risk as any).versionId
          }
        });
        
        return;
      }
    } catch (error) {
      logger.error('Error scoring trade idea with gatekeeper:', { error });
    }
    
    // Calculate ATR-based stop and target levels
    const R_MULT = 1.0;         // stop = 1.0×ATR (tighter stops for better RR)
    const side = tradeIdea.side;
    const entry = candle.c;
    const atr = this.indCache.atr14;   // Use the 14-period ATR from indicator cache

    // DEBUG: Log ATR calculation details
    logger.info(`🔍 ATR DEBUG: Symbol=${this.symbol}, ATR14=${atr}, Entry=${entry.toFixed(2)}, Side=${side}, R_MULT=${R_MULT}`);

    let stopPrice: number;
    let targetPrice: number;
    let usingATR = false;

    // If ATR is not available (insufficient data), fallback to percentage-based approach
    if (atr === 0 || atr === null || atr === undefined || isNaN(atr)) {
      logger.warn(`🚨 ATR FALLBACK: ATR=${atr} for ${this.symbol}, using percentage-based stops`);
      const prev = this.perception.last(2)[0];
      stopPrice = side === 'buy' ? prev.l * 0.99 : prev.h * 1.01;
      targetPrice = side === 'buy' ? prev.h : prev.l;
      usingATR = false;
      logger.info(`📊 FALLBACK LEVELS: Entry=${entry.toFixed(2)}, Stop=${stopPrice.toFixed(2)}, Target=${targetPrice.toFixed(2)}, PrevLow=${prev.l.toFixed(2)}, PrevHigh=${prev.h.toFixed(2)}`);
    } else {
      // ATR-based stop and target calculation
      stopPrice = side === 'buy'
        ? entry - (atr * R_MULT)
        : entry + (atr * R_MULT);

      targetPrice = side === 'buy'
        ? entry + (atr * R_MULT * 2)   // 2× stop distance
        : entry - (atr * R_MULT * 2);

      usingATR = true;
      logger.info(`📊 ATR LEVELS: Entry=${entry.toFixed(2)}, Stop=${stopPrice.toFixed(2)}, Target=${targetPrice.toFixed(2)}, ATR=${atr.toFixed(2)}, StopDist=${(atr * R_MULT).toFixed(2)}, TargetDist=${(atr * R_MULT * 2).toFixed(2)}`);
    }
    
    const qty = this.risk.sizeTrade(stopPrice, entry);
    
    // Prepare full trade idea
    const fullIdea: TradeIdea & { stop: number; target: number } = {
      symbol: this.symbol,
      side: tradeIdea.side,
      price: candle.c,
      qty,
      stop: stopPrice,
      target: targetPrice
    };
    
    // Check dynamic risk-reward ratio based on recent performance
    logger.info(`🎯 RR CHECK: About to check RR for ${side} ${this.symbol} | Entry=${candle.c.toFixed(2)}, Stop=${stopPrice.toFixed(2)}, Target=${targetPrice.toFixed(2)}, UsingATR=${usingATR}`);
    
    const rrResult = await passRRDynamic(fullIdea.side, candle.c, stopPrice, targetPrice, this.symbol);
    
    // Calculate manual RR for verification
    const manualRR = Math.abs((targetPrice - candle.c) / (candle.c - stopPrice));
    const stopDistance = Math.abs(candle.c - stopPrice);
    const targetDistance = Math.abs(targetPrice - candle.c);
    
    // Enhanced logging with detailed breakdown
    logger.info(`🔍 RR DETAILED: Symbol=${this.symbol}, Side=${side}`);
    logger.info(`   📈 Prices: Entry=${candle.c.toFixed(2)}, Stop=${stopPrice.toFixed(2)}, Target=${targetPrice.toFixed(2)}`);
    logger.info(`   📏 Distances: Stop=${stopDistance.toFixed(2)}, Target=${targetDistance.toFixed(2)}`);
    logger.info(`   🧮 RR Calc: (${targetDistance.toFixed(2)} / ${stopDistance.toFixed(2)}) = ${manualRR.toFixed(3)}`);
    logger.info(`   📊 Result: WinProb=${(rrResult.winProb * 100).toFixed(1)}%, Threshold=${rrResult.threshold.toFixed(2)}, Actual=${rrResult.rr.toFixed(3)}, Manual=${manualRR.toFixed(3)}`);
    logger.info(`   ✅ Status: ${rrResult.passed ? 'PASS ✅' : 'FAIL ❌'} (${rrResult.rr.toFixed(3)} ${rrResult.passed ? '>=' : '<'} ${rrResult.threshold.toFixed(2)})`);
    
    if (!rrResult.passed) {
      logger.info(`🚨 BLOCKED: Risk-reward ratio ${rrResult.rr.toFixed(3)} below dynamic threshold ${rrResult.threshold.toFixed(2)} for ${this.symbol.toUpperCase()}`);
      
      // Persist the blocked trade to the database with additional RR metrics
      await prisma.rLDataset.create({
        data: {
          symbol: this.symbol,
          featureVec: JSON.stringify({
            symbol: this.symbol,
            price: candle.c,
            rsi: this.indCache.rsi14,
            adx: this.indCache.adx14,
            volatility: this.indCache.bbWidth,
            recentTrend: (this.indCache.fastMA - this.indCache.slowMA) / candle.c,
            dayOfWeek: new Date().getDay(),
            hourOfDay: new Date().getHours(),
            winProb: rrResult.winProb,
            rrThreshold: rrResult.threshold,
            actualRR: rrResult.rr,
            manualRR: manualRR,
            usingATR: usingATR,
            atrValue: atr,
            stopDistance: stopDistance,
            targetDistance: targetDistance
          }),
          action: 'blocked_rr',
          outcome: 0,
          strategyVersionId: (this.risk as any).versionId
        }
      });
      
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
      
      let fill;
      if ((this.executionEngine as any).supportsOCO) {
        fill = await placeWithOCO(this.executionEngine, order, stopPrice, targetPrice);
      } else {
        fill = await this.executionEngine.place(order);
      }

      if (fill) {
        this.risk.registerOrder(fill.side, fill.qty, fill.price, stopPrice);

        if (rlEntryId) {
          await gate.updateOutcome(rlEntryId, 0);
        }

        logger.info(`COMPLETED: ${order.side.toUpperCase()} ${fill.qty.toFixed(6)} ${this.symbol.toUpperCase()} @ $${fill.price.toFixed(2)} | PnL: $${this.risk.dayPnL.toFixed(2)}`);
      }
    } catch (error) {
      logger.error(`Error executing trade:`, { error, symbol: this.symbol, side: tradeIdea.side });
      // Only check portfolio risk limits
      if (portfolioRisk && !portfolioRisk.canTrade()) {
        logger.warn(`BLOCKED: Portfolio risk limits exceeded for ${this.symbol.toUpperCase()}`);
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