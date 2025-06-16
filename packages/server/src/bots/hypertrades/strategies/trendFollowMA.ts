import { BaseStrategy, TradeIdea, StrategyCtx } from './baseStrategy';
import type { Candle } from '../perception';

export class TrendFollowMA extends BaseStrategy {
  onCandle(c: Candle, ctx: StrategyCtx): TradeIdea | null {
    const { ind, cfg } = ctx;
    
    // Log MA values and price
    console.log(`[DEBUG MA] ${this.symbol} - Price: ${c.c}, Fast MA: ${ind.fastMA}, Slow MA: ${ind.slowMA}`);
    console.log(`[DEBUG MA] MA Difference: ${Math.abs(ind.fastMA - ind.slowMA)}, Price to Fast MA: ${Math.abs(c.c - ind.fastMA)}`);
    
    // Calculate percentage differences
    const maDiffPercent = Math.abs(ind.fastMA - ind.slowMA) / ind.slowMA;
    const priceToFastPercent = Math.abs(c.c - ind.fastMA) / c.c;
    
    console.log(`[DEBUG MA] MA Difference %: ${(maDiffPercent * 100).toFixed(2)}%, Price to Fast MA %: ${(priceToFastPercent * 100).toFixed(2)}%`);
    
    if (ind.fastMA > ind.slowMA && priceToFastPercent < 0.002) {
      console.log(`[DEBUG MA] LONG signal triggered! Fast MA above Slow MA and price near Fast MA`);
      return { side: 'buy', price: c.c, reason: 'Trend MA pull‑back' };
    }
    if (ind.fastMA < ind.slowMA && priceToFastPercent < 0.002) {
      console.log(`[DEBUG MA] SHORT signal triggered! Fast MA below Slow MA and price near Fast MA`);
      return { side: 'sell', price: c.c, reason: 'Trend MA pull‑back (short)' };
    }
    
    return null;
  }
} 