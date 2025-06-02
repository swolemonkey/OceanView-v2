import { BaseStrategy, TradeIdea, StrategyCtx } from './baseStrategy.js';
import type { Candle } from '../perception.js';

export class RangeBounce extends BaseStrategy {
  onCandle(c: Candle, ctx: StrategyCtx): TradeIdea | null {
    const { perception: p, ind } = ctx;
    
    const hi = Math.max(...p.last(50).map(x => x.h));
    const lo = Math.min(...p.last(50).map(x => x.l));
    
    if (ind.avgOB > 0.6 || ind.avgOB < -0.6) return null; // order‑book pressure filter
    
    if (ind.rsi14 < 30 && c.c < lo * 1.02) {
      return { side: 'buy', price: c.c, reason: 'Range bounce long' };
    }
    
    if (ind.rsi14 > 70 && c.c > hi * 0.98) {
      return { side: 'sell', price: c.c, reason: 'Range bounce short' };
    }
    
    return null;
  }
}

export default RangeBounce; 