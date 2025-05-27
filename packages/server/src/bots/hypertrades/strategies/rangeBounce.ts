import { BaseStrategy, TradeIdea, StrategyCtx } from './baseStrategy.js';
import { Candle } from '../perception.js';

export class RangeBounce extends BaseStrategy {
  onCandle(c: Candle, ctx: StrategyCtx): TradeIdea|null {
    const { perception: p, ind, cfg } = ctx;
    
    // Get the last 10 candles to determine range
    const candles = p.last(10);
    
    if (candles.length < 10) {
      console.log(`[DEBUG Range] Not enough candles for ${this.symbol}, need at least 10`);
      return null;
    }
    
    // Calculate the high and low of the range
    const high = Math.max(...candles.map(candle => candle.h));
    const low = Math.min(...candles.map(candle => candle.l));
    
    // Calculate volatility as percentage of range size to average price
    const rangeSize = high - low;
    const avgPrice = candles.reduce((sum, candle) => sum + candle.c, 0) / candles.length;
    const volatility = rangeSize / avgPrice;
    
    // Check if we're in a low volatility range (less than 5% range)
    const isLowVol = volatility < 0.05;
    
    console.log(`[DEBUG Range] ${this.symbol} - Range high: ${high.toFixed(2)}, low: ${low.toFixed(2)}, volatility: ${(volatility * 100).toFixed(2)}%`);
    console.log(`[DEBUG Range] RSI: ${ind.rsi14.toFixed(2)}, isLowVol: ${isLowVol}`);
    
    // Core strategy logic for buying at support in low vol range
    if (isLowVol && ind.rsi14 < 30 && c.c < low * 1.02) {
      console.log(`[DEBUG Range] LONG signal triggered! Price near support with oversold RSI`);
      return { side: 'buy', price: c.c, reason: 'Range bounce long' };
    }
    
    // Core strategy logic for selling at resistance in low vol range
    if (isLowVol && ind.rsi14 > 70 && c.c > high * 0.98) {
      console.log(`[DEBUG Range] SHORT signal triggered! Price near resistance with overbought RSI`);
      return { side: 'sell', price: c.c, reason: 'Range bounce short' };
    }
    
    return null;
  }
} 