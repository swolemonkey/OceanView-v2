import { Perception } from '../perception.js';
import type { IndicatorCache } from '../indicators/cache.js';
import type { Config } from '../config.js';
import type { Candle } from '../perception.js';

export interface TradeIdea { side:'buy'|'sell'; price:number; reason:string; }
export interface StrategyCtx {
  perception: Perception;
  ind: IndicatorCache;
  cfg: Config;
}
export abstract class BaseStrategy {
  symbol: string;
  constructor(symbol:string){ this.symbol=symbol; }
  abstract onCandle(candle: Candle, ctx: StrategyCtx): TradeIdea|null;
} 