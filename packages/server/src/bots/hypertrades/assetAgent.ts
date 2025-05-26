import { Perception } from './perception.js';
import { RiskManager } from './risk.js';
import { decide } from './decision.js';
import { executeIdea } from './execution.js';
import type { Config } from './config.js';

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
  constructor(symbol: string, cfg: Config, botId: number, versionId: number) {
    this.symbol = symbol;
    this.cfg = cfg;
    this.perception = new Perception();
    this.risk = new RiskManager(botId, cfg);
    // store versionId inside risk for trade logging
    (this.risk as any).versionId = versionId;
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
    
    const decision = await decide(this.perception, { ...this.cfg, symbol: this.symbol });
    
    // Decision is now always defined and has a reason
    if (!decision) {
      return; // Just in case decide returns null (shouldn't happen with our updates)
    }
    
    // Check if it's a trade or a hold action
    if ('action' in decision && decision.action === 'hold') {
      // Log the hold action with reason
      console.log(`[${new Date().toISOString()}] DECISION: HOLD ${this.symbol.toUpperCase()} @ $${price.toFixed(2)} | ${decision.reason}`);
      return;
    }
    
    // It's a trade idea
    const idea = decision as TradeIdea;
    console.log(`[${new Date().toISOString()}] DECISION: ${idea.side.toUpperCase()} ${this.symbol.toUpperCase()} @ $${price.toFixed(2)} | ${idea.reason || 'Technical analysis signals'}`);
    
    if (this.risk.canTrade()) {
      const stop = idea.side === 'buy' 
        ? lastCandles[0].l * 0.99  // 1% below recent low for long
        : lastCandles[0].h * 1.01; // 1% above recent high for short
        
      const qty = this.risk.sizeTrade(stop, idea.price);
      
      // Log trade execution
      console.log(`[${new Date().toISOString()}] EXECUTING: ${idea.side.toUpperCase()} ${qty.toFixed(6)} ${this.symbol.toUpperCase()} @ $${idea.price.toFixed(2)}`);
      
      // Cast idea to ensure side is the correct type
      executeIdea({ ...idea, side: idea.side as 'buy' | 'sell', qty }, console.log);
      this.risk.registerOrder(idea.side as 'buy' | 'sell', qty, idea.price, stop);
      
      // Log trade completion
      console.log(`[${new Date().toISOString()}] COMPLETED: ${idea.side.toUpperCase()} ${qty.toFixed(6)} ${this.symbol.toUpperCase()} @ $${idea.price.toFixed(2)} | PnL: $${this.risk.dayPnL.toFixed(2)}`);
    } else {
      console.log(`[${new Date().toISOString()}] BLOCKED: Risk limits exceeded for ${this.symbol.toUpperCase()}. Open risk: ${this.risk.openRisk.toFixed(2)}%`);
    }
  }
} 