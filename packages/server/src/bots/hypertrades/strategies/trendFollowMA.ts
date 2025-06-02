import { BaseStrategy, TradeIdea, StrategyCtx } from './baseStrategy.js';
import type { Candle } from '../perception.js';

export class TrendFollowMA extends BaseStrategy {
  onCandle(c: Candle, ctx: StrategyCtx): TradeIdea | null {
    const { ind, cfg } = ctx;
    if (ind.fastMA > ind.slowMA && Math.abs(c.c - ind.fastMA) / c.c < 0.002) {
      return { side: 'buy', price: c.c, reason: 'Trend MA pull‑back' };
    }
    if (ind.fastMA < ind.slowMA && Math.abs(c.c - ind.fastMA) / c.c < 0.002) {
      return { side: 'sell', price: c.c, reason: 'Trend MA pull‑back (short)' };
    }
    return null;
  }
} 