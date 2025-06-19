import type { Candle } from '../perception.js';
import type { Perception } from '../perception.js';
import type { IndicatorCache } from '../indicators/cache.js';
import type { Config } from '../config.js';
import type { MarketRegimeAnalysis } from '../marketRegimeDetector.js';

export interface TradeIdea {
  side: 'buy' | 'sell';
  price: number;
  reason: string;
  confidence?: number; // Optional confidence score (0-1)
}

export interface StrategyCtx {
  ind: IndicatorCache;
  perception: Perception;
  cfg: any;
  regime?: MarketRegimeAnalysis | null; // Market regime context
}

export abstract class BaseStrategy {
  constructor(public symbol: string) {}
  abstract onCandle(candle: Candle, ctx: StrategyCtx): TradeIdea | null;
} 