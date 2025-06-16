import type { Candle } from '../perception';
import type { Perception } from '../perception';
import type { IndicatorCache } from '../indicators/cache';
import type { Config } from '../config';

export interface TradeIdea {
  side: 'buy' | 'sell';
  price: number;
  reason: string;
}

export interface StrategyCtx {
  ind: IndicatorCache;
  perception: Perception;
  cfg: any;
}

export abstract class BaseStrategy {
  constructor(public symbol: string) {}
  abstract onCandle(candle: Candle, ctx: StrategyCtx): TradeIdea | null;
} 