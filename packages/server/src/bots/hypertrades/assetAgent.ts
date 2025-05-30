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
    
    // Get strategy toggle for this symbol
    const symbolToggle = cfg.strategyToggle[symbol] || {};
    
    // Initialize strategies based on configuration
    if (symbolToggle.smcReversal !== false) { // Default to true if not specified
      this.strategies.push(new SMCReversal(symbol));
    }
    
    if (symbolToggle.trendFollowMA === true) {
      this.strategies.push(new TrendFollowMA(symbol));
    }
    
    if (symbolToggle.rangeBounce === true) {
      this.strategies.push(new RangeBounce(symbol));
    }
    
    console.log(`[${new Date().toISOString()}] Initialized strategies for ${symbol}: ${this.strategies.map(s => s.constructor.name).join(', ')}`);
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
      console.log(`[${new Date().toISOString()}] ${this.symbol.toUpperCase()}: Not enough data yet, need at least 2 candles`);
      return; // Need at least 2 candles
    }
  }
  
  async onCandleClose(candle: Candle) {
    // Update the candle in perception
    this.perception.onCandleClose(candle);
    
    // Update indicator cache
    this.indCache.updateOnClose(candle.c);
    
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
      console.log(`[${new Date().toISOString()}] DECISION: HOLD ${this.symbol.toUpperCase()} @ $${candle.c.toFixed(2)} | No trade signals`);
      return;
    }
    
    console.log(`[${new Date().toISOString()}] DECISION: ${tradeIdea.side.toUpperCase()} ${this.symbol.toUpperCase()} @ $${candle.c.toFixed(2)} | ${tradeIdea.reason}`);
    
    // Import the RLGatekeeper dynamically to avoid circular dependencies
    const gatekeeper = await import('../../rl/gatekeeper.js').then(
      module => new module.RLGatekeeper((this.risk as any).versionId || 1)
    );
    
    // Prepare feature vector for RL model
    const features = {
      symbol: this.symbol,
      price: candle.c,
      rsi: this.indCache.rsi14 || 50,
      adx: this.indCache.adx14 || 25,
      volatility: Math.abs(candle.h - candle.l) / candle.c,
      recentTrend: (candle.c - candle.o) / candle.o,
      rsi14: this.indCache.rsi14 || 50,
      adx14: this.indCache.adx14 || 25,
      fastMASlowDelta: (this.indCache.fastMA - this.indCache.slowMA) / candle.c,
      bbWidth: this.indCache.bbWidth || 0,
      avgSent: 0, // We'll need to implement sentiment tracking
      avgOB: 0,   // We'll need to implement order book tracking
      dayOfWeek: new Date().getDay(),
      hourOfDay: new Date().getHours()
    };
    
    // Score the trade idea with the RL gatekeeper (active mode)
    const score = await gatekeeper.scoreIdea(features, tradeIdea.side);
    console.log(`[${new Date().toISOString()}] RL Score: ${score.toFixed(4)} for ${tradeIdea.side.toUpperCase()} ${this.symbol.toUpperCase()}`);
    
    // Veto trade if score is below threshold
    if (score < 0.55) {
      console.log(`[${new Date().toISOString()}] BLOCKED: Trade vetoed by gatekeeper with score ${score.toFixed(4)}`);
      return;
    }
    
    // Process the trade idea
    if (this.risk.canTrade()) {
      const lastCandles = this.perception.last(2);
      const stop = tradeIdea.side === 'buy' 
        ? lastCandles[0].l * 0.99  // 1% below recent low for long
        : lastCandles[0].h * 1.01; // 1% above recent high for short
      
      // Check risk-reward ratio using our helper
      const target = tradeIdea.side === 'buy'
        ? candle.c + (candle.c - stop) * 2  // 1:2 risk-reward for now
        : candle.c - (stop - candle.c) * 2;
      
      if (!passRR(tradeIdea.side, candle.c, stop, target, 2)) {
        console.log(`[${new Date().toISOString()}] BLOCKED: Risk-reward ratio below threshold for ${this.symbol.toUpperCase()}`);
        return;
      }
      
      const qty = this.risk.sizeTrade(stop, candle.c);
      
      // Log trade execution
      console.log(`[${new Date().toISOString()}] EXECUTING: ${tradeIdea.side.toUpperCase()} ${qty.toFixed(6)} ${this.symbol.toUpperCase()} @ $${candle.c.toFixed(2)}`);
      
      // Create order for execution
      const order: Order = {
        symbol: this.symbol,
        side: tradeIdea.side,
        qty,
        price: candle.c,
        type: 'market'
      };
      
      try {
        // Execute the trade using the execution engine with retry logic
        const fill = await this.executeWithRetry(order);
        
        // Register the order with risk manager
        this.risk.registerOrder(order.side, fill.qty, fill.price, stop);
        
        // Log trade completion
        console.log(`[${new Date().toISOString()}] COMPLETED: ${order.side.toUpperCase()} ${fill.qty.toFixed(6)} ${this.symbol.toUpperCase()} @ $${fill.price.toFixed(2)} | PnL: $${this.risk.dayPnL.toFixed(2)}`);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] ERROR: Failed to execute ${order.side} for ${this.symbol}: ${String(error)}`);
      }
    } else {
      console.log(`[${new Date().toISOString()}] BLOCKED: Risk limits exceeded for ${this.symbol.toUpperCase()}. Open risk: ${this.risk.openRisk.toFixed(2)}%`);
    }
  }
  
  // Execute an order with exponential backoff retry (3 attempts)
  private async executeWithRetry(order: Order, maxRetries = 3): Promise<any> {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Exponential backoff delay
        if (attempt > 0) {
          const delay = Math.pow(2, attempt) * 1000; // 2^attempt seconds
          console.log(`[${new Date().toISOString()}] Retry attempt ${attempt + 1} for ${order.side} ${order.symbol} after ${delay/1000}s delay`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // Execute the order
        return await this.executionEngine.place(order);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Execution attempt ${attempt + 1} failed: ${String(error)}`);
        lastError = error;
      }
    }
    
    // If we get here, all attempts failed
    console.error(`[${new Date().toISOString()}] All ${maxRetries} execution attempts failed for ${order.side} ${order.symbol}`);
    throw lastError;
  }
} 