import type { Candle } from '@/bots/hypertrades/perception.js';
import type { Perception } from '@/bots/hypertrades/perception.js';
import type { IndicatorCache } from '@/bots/hypertrades/indicators/cache.js';
import type { Config } from '@/bots/hypertrades/config.js';

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