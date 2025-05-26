import { Perception, Candle } from './perception.js';
import { RiskManager } from './risk.js';
import { executeIdea } from './execution.js';
import type { Config } from './config.js';
import { IndicatorCache } from './indicators/cache.js';
import { BaseStrategy } from './strategies/baseStrategy.js';
import { SMCReversal } from './strategies/smcReversal.js';
import { passRR } from './utils/riskReward.js';

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
  indCache: IndicatorCache;
  strategies: BaseStrategy[] = [];
  
  constructor(symbol: string, cfg: Config, botId: number, versionId: number) {
    this.symbol = symbol;
    this.cfg = cfg;
    this.perception = new Perception();
    this.risk = new RiskManager(botId, cfg);
    this.indCache = new IndicatorCache();
    
    // store versionId inside risk for trade logging
    (this.risk as any).versionId = versionId;
    
    // Initialize strategies
    this.strategies.push(new SMCReversal(symbol));
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
      
      // Create full trade idea for execution
      const idea: TradeIdea = {
        symbol: this.symbol,
        side: tradeIdea.side,
        qty,
        price: candle.c,
        reason: tradeIdea.reason
      };
      
      // Execute the trade
      executeIdea(idea, console.log);
      this.risk.registerOrder(idea.side, qty, idea.price, stop);
      
      // Log trade completion
      console.log(`[${new Date().toISOString()}] COMPLETED: ${idea.side.toUpperCase()} ${qty.toFixed(6)} ${this.symbol.toUpperCase()} @ $${idea.price.toFixed(2)} | PnL: $${this.risk.dayPnL.toFixed(2)}`);
    } else {
      console.log(`[${new Date().toISOString()}] BLOCKED: Risk limits exceeded for ${this.symbol.toUpperCase()}. Open risk: ${this.risk.openRisk.toFixed(2)}%`);
    }
  }
} 