import { BaseStrategy, TradeIdea, StrategyCtx } from './baseStrategy.js';
import { Candle } from '../perception.js';

export class TrendFollowMA extends BaseStrategy {
  onCandle(c: Candle, ctx: StrategyCtx): TradeIdea|null {
    const { ind } = ctx;
    
    // Check if we have enough data
    if (!ind.fastMA || !ind.slowMA || !ind.rsi14 || !ind.adx14) {
      console.log(`[DEBUG TrendMA] Not enough data for ${this.symbol}, waiting for indicator calculations`);
      return null;
    }
    
    console.log(`[DEBUG TrendMA] Symbol: ${this.symbol}, fastMA: ${ind.fastMA.toFixed(2)}, slowMA: ${ind.slowMA.toFixed(2)}, RSI: ${ind.rsi14.toFixed(2)}, ADX: ${ind.adx14.toFixed(2)}`);
    
    // ========================================
    // 🚀 ENHANCED TREND FOLLOWING STRATEGY
    // ========================================
    
    const trendStrength = Math.abs(ind.fastMA - ind.slowMA) / c.c;
    const priceToFastMA = Math.abs(c.c - ind.fastMA) / c.c;
    const priceToSlowMA = Math.abs(c.c - ind.slowMA) / c.c;
    
    // LONG CONDITIONS - Enhanced with multiple confirmations
    if (ind.fastMA > ind.slowMA) { // Basic uptrend
      // Condition 1: Pullback to fast MA (original logic)
      if (priceToFastMA < 0.003) { // Within 0.3% of fast MA
        console.log(`[DEBUG TrendMA] LONG signal: Pullback to fast MA in uptrend`);
        return { side: 'buy', price: c.c, reason: 'Trend MA pullback to fast' };
      }
      
      // Condition 2: Strong momentum breakout above slow MA
      if (c.c > ind.slowMA && priceToSlowMA < 0.005 && ind.adx14 > 25 && ind.rsi14 < 70) {
        console.log(`[DEBUG TrendMA] LONG signal: Momentum breakout above slow MA`);
        return { side: 'buy', price: c.c, reason: 'Trend MA momentum breakout' };
      }
      
      // Condition 3: Oversold bounce in uptrend
      if (ind.rsi14 < 40 && c.c > ind.fastMA && trendStrength > 0.005) {
        console.log(`[DEBUG TrendMA] LONG signal: Oversold bounce in strong uptrend`);
        return { side: 'buy', price: c.c, reason: 'Trend MA oversold bounce' };
      }
    }
    
    // SHORT CONDITIONS - Added for more trading opportunities
    if (ind.fastMA < ind.slowMA) { // Basic downtrend
      // Condition 1: Pullback to fast MA in downtrend
      if (priceToFastMA < 0.003) { // Within 0.3% of fast MA
        console.log(`[DEBUG TrendMA] SHORT signal: Pullback to fast MA in downtrend`);
        return { side: 'sell', price: c.c, reason: 'Trend MA pullback to fast (short)' };
      }
      
      // Condition 2: Strong momentum breakdown below slow MA  
      if (c.c < ind.slowMA && priceToSlowMA < 0.005 && ind.adx14 > 25 && ind.rsi14 > 30) {
        console.log(`[DEBUG TrendMA] SHORT signal: Momentum breakdown below slow MA`);
        return { side: 'sell', price: c.c, reason: 'Trend MA momentum breakdown' };
      }
      
      // Condition 3: Overbought rejection in downtrend
      if (ind.rsi14 > 60 && c.c < ind.fastMA && trendStrength > 0.005) {
        console.log(`[DEBUG TrendMA] SHORT signal: Overbought rejection in strong downtrend`);
        return { side: 'sell', price: c.c, reason: 'Trend MA overbought rejection' };
      }
    }
    
    return null;
  }
} 