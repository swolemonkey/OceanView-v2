import { BaseStrategy, TradeIdea, StrategyCtx } from './baseStrategy';
import { Candle } from '../perception';

export class TrendFollowMA extends BaseStrategy {
  onCandle(c: Candle, ctx: StrategyCtx): TradeIdea|null {
    const { ind } = ctx;
    
    // Check if we have enough data
    if (!ind.fastMA || !ind.slowMA) {
      console.log(`[DEBUG TrendMA] Not enough data for ${this.symbol}, waiting for MA calculations`);
      return null;
    }
    
    console.log(`[DEBUG TrendMA] Symbol: ${this.symbol}, fastMA: ${ind.fastMA.toFixed(2)}, slowMA: ${ind.slowMA.toFixed(2)}`);
    
    // Core strategy logic: join pullbacks when fastMA > slowMA
    if (ind.fastMA > ind.slowMA && Math.abs(c.c - ind.fastMA)/c.c < 0.002) {
      console.log(`[DEBUG TrendMA] LONG signal triggered! Price near fastMA in uptrend`);
      return { side: 'buy', price: c.c, reason: 'Trend MA pull‑back' };
    }
    
    return null;
  }
} 