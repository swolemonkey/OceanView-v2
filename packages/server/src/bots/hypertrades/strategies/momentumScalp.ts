import { BaseStrategy, TradeIdea, StrategyCtx } from './baseStrategy.js';
import type { Candle } from '../perception.js';

/**
 * 🚀 MOMENTUM SCALPING STRATEGY
 * 
 * Optimized for 5-minute timeframes with:
 * - Quick momentum breakouts
 * - Tight risk management
 * - High win rate through selective entries
 * - Rapid fire trading in trending conditions
 */
export class MomentumScalp extends BaseStrategy {

  onCandle(c: Candle, ctx: StrategyCtx): TradeIdea | null {
    const { ind, perception, cfg } = ctx;
    
    // Ensure we have enough data
    if (!ind.fastMA || !ind.slowMA || !ind.rsi14 || !ind.adx14 || !ind.atr14) {
      console.log(`[DEBUG MomentumScalp] Not enough data for ${this.symbol}, waiting for indicators`);
      return null;
    }
    
    const candles = perception.last(20);
    if (candles.length < 20) return null;
    
    console.log(`[DEBUG MomentumScalp] Symbol: ${this.symbol}, Price: ${c.c.toFixed(2)}, RSI: ${ind.rsi14.toFixed(2)}, ADX: ${ind.adx14.toFixed(2)}, ATR: ${ind.atr14.toFixed(2)}`);
    
    // ========================================
    // 🎯 MOMENTUM SCALPING ANALYSIS
    // ========================================
    
    const momentumSignal = this.analyzeMomentumBreakout(candles, ind);
    const volumeProfile = this.analyzeVolumeAcceleration(candles);
    const microTrend = this.detectMicroTrend(candles, ind);
    const volatilityState = this.assessVolatilityState(candles, ind);
    const priceAction = this.analyzePriceActionSignals(candles);
    
    console.log(`[DEBUG MomentumScalp] Momentum: ${momentumSignal.strength.toFixed(2)}, Volume: ${volumeProfile.accelerating ? 'accelerating' : 'normal'}, MicroTrend: ${microTrend.direction}, Volatility: ${volatilityState.ideal ? 'ideal' : 'high'}`);
    
    // ========================================
    // 🚀 BULLISH MOMENTUM SCALP CONDITIONS
    // ========================================
    
    if (momentumSignal.bullish && 
        microTrend.direction === 'bullish' &&
        volatilityState.ideal) {
      
             // Condition 1: Momentum Breakout with Volume Acceleration
       if (momentumSignal.strength > 0.5 && // Reduced from 0.7
           volumeProfile.accelerating &&
           ind.rsi14 > 40 && ind.rsi14 < 80 && // Wider RSI range
           ind.adx14 > 15 && // Reduced from 20
           priceAction.bullishPattern) {
        
        console.log(`[DEBUG MomentumScalp] LONG signal: Strong momentum breakout with volume`);
        return {
          side: 'buy',
          price: c.c,
          reason: 'Momentum scalp breakout + volume acceleration',
          confidence: 0.8 + (momentumSignal.strength * 0.15)
        };
      }
      
      // Condition 2: Micro Pullback in Strong Momentum
      if (momentumSignal.strength > 0.6 &&
          priceAction.microPullback &&
          c.c > ind.fastMA * 0.999 && // Very close to fast MA
          ind.rsi14 > 50 && ind.rsi14 < 70 &&
          microTrend.strength > 0.5) {
        
        console.log(`[DEBUG MomentumScalp] LONG signal: Micro pullback in strong momentum`);
        return {
          side: 'buy',
          price: c.c,
          reason: 'Momentum scalp micro pullback',
          confidence: 0.75 + (microTrend.strength * 0.2)
        };
      }
      
      // Condition 3: Rapid Fire Continuation (High Frequency)
      if (momentumSignal.strength > 0.5 &&
          microTrend.accelerating &&
          c.c > candles[candles.length - 2].c && // Price advancing
          ind.adx14 > 25 &&
          volatilityState.expanding) {
        
        console.log(`[DEBUG MomentumScalp] LONG signal: Rapid fire continuation`);
        return {
          side: 'buy',
          price: c.c,
          reason: 'Momentum scalp rapid continuation',
          confidence: 0.7
        };
      }
    }
    
    // ========================================
    // 🔻 BEARISH MOMENTUM SCALP CONDITIONS
    // ========================================
    
    if (momentumSignal.bearish && 
        microTrend.direction === 'bearish' &&
        volatilityState.ideal) {
      
             // Condition 1: Momentum Breakdown with Volume Acceleration
       if (momentumSignal.strength > 0.5 && // Reduced from 0.7
           volumeProfile.accelerating &&
           ind.rsi14 < 60 && ind.rsi14 > 20 && // Wider RSI range
           ind.adx14 > 15 && // Reduced from 20
           priceAction.bearishPattern) {
        
        console.log(`[DEBUG MomentumScalp] SHORT signal: Strong momentum breakdown with volume`);
        return {
          side: 'sell',
          price: c.c,
          reason: 'Momentum scalp breakdown + volume acceleration',
          confidence: 0.8 + (momentumSignal.strength * 0.15)
        };
      }
      
      // Condition 2: Micro Rejection in Strong Momentum
      if (momentumSignal.strength > 0.6 &&
          priceAction.microRejection &&
          c.c < ind.fastMA * 1.001 && // Very close to fast MA
          ind.rsi14 < 50 && ind.rsi14 > 30 &&
          microTrend.strength > 0.5) {
        
        console.log(`[DEBUG MomentumScalp] SHORT signal: Micro rejection in strong momentum`);
        return {
          side: 'sell',
          price: c.c,
          reason: 'Momentum scalp micro rejection',
          confidence: 0.75 + (microTrend.strength * 0.2)
        };
      }
      
      // Condition 3: Rapid Fire Continuation (High Frequency)
      if (momentumSignal.strength > 0.5 &&
          microTrend.accelerating &&
          c.c < candles[candles.length - 2].c && // Price declining
          ind.adx14 > 25 &&
          volatilityState.expanding) {
        
        console.log(`[DEBUG MomentumScalp] SHORT signal: Rapid fire continuation`);
        return {
          side: 'sell',
          price: c.c,
          reason: 'Momentum scalp rapid continuation',
          confidence: 0.7
        };
      }
    }
    
    return null;
  }
  
  // ========================================
  // 🔍 MOMENTUM SCALPING ANALYSIS METHODS
  // ========================================
  
  private analyzeMomentumBreakout(candles: Candle[], ind: any): {
    bullish: boolean, 
    bearish: boolean, 
    strength: number
  } {
    const recent = candles.slice(-5);
    const current = recent[recent.length - 1];
    const prev = recent[recent.length - 2];
    
    // Price momentum
    const priceMomentum = (current.c - prev.c) / prev.c;
    const momentumMagnitude = Math.abs(priceMomentum);
    
    // RSI momentum
    const rsiMomentum = ind.rsi14 > 50 ? (ind.rsi14 - 50) / 50 : (50 - ind.rsi14) / 50;
    
    // ADX trend strength
    const trendStrength = Math.min(1, ind.adx14 / 40);
    
    // Combined momentum strength
    const strength = (momentumMagnitude * 100 + rsiMomentum + trendStrength) / 3;
    
    return {
      bullish: priceMomentum > 0.0005 && ind.rsi14 > 45, // 0.05% price move minimum
      bearish: priceMomentum < -0.0005 && ind.rsi14 < 55,
      strength: Math.min(1, strength)
    };
  }
  
  private analyzeVolumeAcceleration(candles: Candle[]): {
    accelerating: boolean,
    strength: number
  } {
    if (candles.length < 5) return { accelerating: false, strength: 0 };
    
    const recent = candles.slice(-5);
    
    // Use range expansion as volume proxy
    const ranges = recent.map(c => c.h - c.l);
    const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
    const currentRange = ranges[ranges.length - 1];
    const prevRange = ranges[ranges.length - 2];
    
    const rangeAcceleration = currentRange > prevRange * 1.15; // 15% expansion
    const aboveAverage = currentRange > avgRange * 1.1;
    
    const strength = Math.min(1, currentRange / (avgRange * 1.5));
    
    return {
      accelerating: rangeAcceleration && aboveAverage,
      strength
    };
  }
  
  private detectMicroTrend(candles: Candle[], ind: any): {
    direction: 'bullish' | 'bearish' | 'neutral',
    strength: number,
    accelerating: boolean
  } {
    if (candles.length < 10) return { direction: 'neutral', strength: 0, accelerating: false };
    
    const recent = candles.slice(-10);
    const prices = recent.map(c => c.c);
    
    // Calculate micro trend using 3-period EMA
    const ema3 = this.calculateEMA(prices, 3);
    const ema8 = this.calculateEMA(prices, 8);
    
    const currentPrice = prices[prices.length - 1];
    const prevPrice = prices[prices.length - 2];
    
    // Trend direction
    let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (ema3 > ema8 && currentPrice > ema3) direction = 'bullish';
    else if (ema3 < ema8 && currentPrice < ema3) direction = 'bearish';
    
    // Trend strength
    const separation = Math.abs(ema3 - ema8) / currentPrice;
    const strength = Math.min(1, separation * 100);
    
    // Acceleration
    const acceleration = Math.abs(currentPrice - prevPrice) / prevPrice;
    const accelerating = acceleration > 0.001; // 0.1% price change
    
    return { direction, strength, accelerating };
  }
  
  private assessVolatilityState(candles: Candle[], ind: any): {
    ideal: boolean,
    expanding: boolean,
    contracting: boolean
  } {
    const atrRatio = ind.atr14 / candles[candles.length - 1].c;
    
    // More permissive volatility for scalping: allow higher volatility 
    const ideal = atrRatio > 0.002 && atrRatio < 0.020; // 0.2% to 2.0% (was 0.3% to 1.2%)
    
    // Check if volatility is expanding or contracting
    if (candles.length < 5) return { ideal, expanding: false, contracting: false };
    
    const recent = candles.slice(-5);
    const recentRanges = recent.map(c => (c.h - c.l) / c.c);
    const avgRecentRange = recentRanges.reduce((a, b) => a + b, 0) / recentRanges.length;
    const currentRange = recentRanges[recentRanges.length - 1];
    
    const expanding = currentRange > avgRecentRange * 1.2;
    const contracting = currentRange < avgRecentRange * 0.8;
    
    return { ideal, expanding, contracting };
  }
  
  private analyzePriceActionSignals(candles: Candle[]): {
    bullishPattern: boolean,
    bearishPattern: boolean,
    microPullback: boolean,
    microRejection: boolean
  } {
    if (candles.length < 5) return {
      bullishPattern: false,
      bearishPattern: false,
      microPullback: false,
      microRejection: false
    };
    
    const recent = candles.slice(-3);
    const [prev2, prev1, current] = recent;
    
    // Bullish patterns
    const bullishEngulfing = current.c > current.o && 
                            prev1.c < prev1.o && 
                            current.c > prev1.o && 
                            current.o < prev1.c;
    
    const bullishHammer = (current.c - current.l) > (current.h - current.c) * 2 &&
                         current.c > current.o;
    
    // Bearish patterns
    const bearishEngulfing = current.c < current.o && 
                            prev1.c > prev1.o && 
                            current.c < prev1.o && 
                            current.o > prev1.c;
    
    const bearishShooting = (current.h - current.c) > (current.c - current.l) * 2 &&
                           current.c < current.o;
    
    // Micro movements
    const microPullback = current.c < prev1.c && current.c > prev2.c && // Small pullback
                         (prev1.c - current.c) / prev1.c < 0.002; // Less than 0.2%
    
    const microRejection = current.c > prev1.c && current.c < prev2.c && // Small rejection
                          (current.c - prev1.c) / prev1.c < 0.002; // Less than 0.2%
    
    return {
      bullishPattern: bullishEngulfing || bullishHammer,
      bearishPattern: bearishEngulfing || bearishShooting,
      microPullback,
      microRejection
    };
  }
  
  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1];
    
    const multiplier = 2 / (period + 1);
    let ema = prices[0];
    
    for (let i = 1; i < prices.length; i++) {
      ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
    }
    
    return ema;
  }
} 