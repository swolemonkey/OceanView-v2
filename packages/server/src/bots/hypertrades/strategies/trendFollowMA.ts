import { BaseStrategy, TradeIdea, StrategyCtx } from './baseStrategy.js';
import type { Candle } from '../perception.js';

export class TrendFollowMA extends BaseStrategy {
  constructor(symbol: string) {
    super(symbol);
  }

  onCandle(c: Candle, ctx: StrategyCtx): TradeIdea | null {
    const { ind, perception, cfg } = ctx;
    
    // Check if we have enough data
    if (!ind.fastMA || !ind.slowMA || !ind.rsi14 || !ind.adx14) {
      console.log(`[DEBUG TrendMA] Not enough data for ${this.symbol}, waiting for indicator calculations`);
      return null;
    }
    
    console.log(`[DEBUG TrendMA] Symbol: ${this.symbol}, fastMA: ${ind.fastMA.toFixed(2)}, slowMA: ${ind.slowMA.toFixed(2)}, RSI: ${ind.rsi14.toFixed(2)}, ADX: ${ind.adx14.toFixed(2)}`);
    
        // ========================================
    // 🚀 ENHANCED TREND FOLLOWING STRATEGY FOR 5M TIMEFRAMES
    // ========================================
    
    const candles = perception.last(10);
    if (candles.length < 10) return null;
    
    // Calculate additional trend indicators
    const trendAnalysis = this.analyzeTrendStrength(candles, ind);
    const momentumSignal = this.calculateMomentumSignal(candles, ind);
    const pullbackQuality = this.assessPullbackQuality(candles, ind);
    const volumeProfile = this.analyzeVolumeProfile(candles);
    
    console.log(`[DEBUG TrendMA] Trend: ${trendAnalysis.direction}, Strength: ${trendAnalysis.strength.toFixed(2)}, Momentum: ${momentumSignal.score.toFixed(2)}, Pullback: ${pullbackQuality.quality}, Volume: ${volumeProfile.trending ? 'trending' : 'ranging'}`);
    
    const trendStrength = Math.abs(ind.fastMA - ind.slowMA) / c.c;
    
    // ENHANCED LONG CONDITIONS
    if (trendAnalysis.direction === 'bullish' && trendAnalysis.strength > 0.003) {
      
      // Condition 1: Classic pullback to fast MA (enhanced for 5m)
      const priceToFastMA = Math.abs(c.c - ind.fastMA) / c.c;
      if (priceToFastMA < 0.002 && // Tighter entry: Within 0.2% of fast MA for better timing
          momentumSignal.bullish && // Momentum supporting
          ind.rsi14 > 35 && ind.rsi14 < 60 && // Better RSI range for trend continuation
          pullbackQuality.quality > 0.7 && // Higher quality for better win rate
          ind.adx14 > 15) { // Ensure trend strength for better entries
        
        console.log(`[DEBUG TrendMA] LONG signal: Enhanced pullback to fast MA`);
        return { 
          side: 'buy', 
          price: c.c, 
          reason: 'Enhanced trend MA pullback to fast',
          confidence: 0.7 + (pullbackQuality.quality * 0.2)
        };
      }
      
      // Condition 2: Momentum breakout with volume confirmation
      if (c.c > ind.slowMA && 
          momentumSignal.score > 0.7 &&
          ind.adx14 > 20 && 
          ind.rsi14 < 75 &&
          volumeProfile.trending) {
        
        console.log(`[DEBUG TrendMA] LONG signal: Momentum breakout with volume`);
        return { 
          side: 'buy', 
          price: c.c, 
          reason: 'Trend MA momentum breakout + volume',
          confidence: 0.6 + (momentumSignal.score * 0.3)
        };
      }
      
      // Condition 3: Oversold bounce in strong uptrend
      if (ind.rsi14 < 35 && 
          c.c > ind.fastMA * 0.998 && // Price near fast MA
          trendStrength > 0.008 && // Strong trend
          this.isBouncingOffSupport(candles)) {
        
        console.log(`[DEBUG TrendMA] LONG signal: Oversold bounce in strong uptrend`);
        return { 
          side: 'buy', 
          price: c.c, 
          reason: 'Trend MA oversold bounce',
          confidence: 0.8
        };
      }
      
      // Condition 4: EMA ribbon squeeze breakout (for 5m timeframe)
      const emaRibbonSignal = this.checkEMARibbonBreakout(candles, 'bullish');
      if (emaRibbonSignal.signal && 
          ind.rsi14 > 50 && 
          ind.adx14 > 15) {
        
        console.log(`[DEBUG TrendMA] LONG signal: EMA ribbon squeeze breakout`);
        return { 
          side: 'buy', 
          price: c.c, 
          reason: 'Trend MA EMA ribbon breakout',
          confidence: emaRibbonSignal.confidence
        };
      }
    }
    
    // ENHANCED SHORT CONDITIONS
    if (trendAnalysis.direction === 'bearish' && trendAnalysis.strength > 0.003) {
      
      // Condition 1: Classic pullback to fast MA (enhanced for 5m)
      const priceToFastMA = Math.abs(c.c - ind.fastMA) / c.c;
      if (priceToFastMA < 0.002 && // Tighter entry: Within 0.2% of fast MA for better timing
          momentumSignal.bearish && // Momentum supporting
          ind.rsi14 < 65 && ind.rsi14 > 40 && // Better RSI range for trend continuation
          pullbackQuality.quality > 0.7 && // Higher quality for better win rate
          ind.adx14 > 15) { // Ensure trend strength for better entries
        
        console.log(`[DEBUG TrendMA] SHORT signal: Enhanced pullback to fast MA`);
        return { 
          side: 'sell', 
          price: c.c, 
          reason: 'Enhanced trend MA pullback to fast (short)',
          confidence: 0.7 + (pullbackQuality.quality * 0.2)
        };
      }
      
      // Condition 2: Momentum breakdown with volume confirmation
      if (c.c < ind.slowMA && 
          momentumSignal.score > 0.7 &&
          ind.adx14 > 20 && 
          ind.rsi14 > 25 &&
          volumeProfile.trending) {
        
        console.log(`[DEBUG TrendMA] SHORT signal: Momentum breakdown with volume`);
        return { 
          side: 'sell', 
          price: c.c, 
          reason: 'Trend MA momentum breakdown + volume',
          confidence: 0.6 + (momentumSignal.score * 0.3)
        };
      }
      
      // Condition 3: Overbought rejection in strong downtrend
      if (ind.rsi14 > 65 && 
          c.c < ind.fastMA * 1.002 && // Price near fast MA
          trendStrength > 0.008 && // Strong trend
          this.isRejectedAtResistance(candles)) {
        
        console.log(`[DEBUG TrendMA] SHORT signal: Overbought rejection in strong downtrend`);
        return { 
          side: 'sell', 
          price: c.c, 
          reason: 'Trend MA overbought rejection',
          confidence: 0.8
        };
      }
      
      // Condition 4: EMA ribbon squeeze breakdown (for 5m timeframe)
      const emaRibbonSignal = this.checkEMARibbonBreakout(candles, 'bearish');
      if (emaRibbonSignal.signal && 
          ind.rsi14 < 50 && 
          ind.adx14 > 15) {
        
        console.log(`[DEBUG TrendMA] SHORT signal: EMA ribbon squeeze breakdown`);
        return { 
          side: 'sell', 
          price: c.c, 
          reason: 'Trend MA EMA ribbon breakdown',
          confidence: emaRibbonSignal.confidence
        };
      }
    }
    
    return null;
  }
  
      // ========================================
    // 🔍 ENHANCED ANALYSIS METHODS FOR 5M TIMEFRAMES
    // ========================================
  
  private analyzeTrendStrength(candles: Candle[], ind: any): {direction: 'bullish' | 'bearish' | 'neutral', strength: number} {
    const fastMA = ind.fastMA;
    const slowMA = ind.slowMA;
    const adx = ind.adx14;
    
    // Calculate trend direction
    let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (fastMA > slowMA) direction = 'bullish';
    else if (fastMA < slowMA) direction = 'bearish';
    
    // Calculate trend strength (0-1)
    const maSeparation = Math.abs(fastMA - slowMA) / fastMA;
    const adxStrength = Math.min(1.0, adx / 50);
    const pricePosition = direction === 'bullish' 
      ? Math.min(1.0, (candles[candles.length - 1].c - slowMA) / (fastMA - slowMA))
      : Math.min(1.0, (slowMA - candles[candles.length - 1].c) / (slowMA - fastMA));
    
    const strength = (maSeparation * 40 + adxStrength * 0.4 + pricePosition * 0.2);
    
    return { direction, strength };
  }
  
  private calculateMomentumSignal(candles: Candle[], ind: any): {score: number, bullish: boolean, bearish: boolean} {
    const rsi = ind.rsi14;
    const adx = ind.adx14;
    const current = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    
    // Price momentum
    const priceMomentum = (current.c - prev.c) / prev.c;
    
    // RSI momentum
    const rsiMomentum = rsi > 50 ? (rsi - 50) / 50 : (50 - rsi) / 50;
    
    // ADX momentum (trend strength)
    const adxMomentum = Math.min(1.0, adx / 40);
    
    // Combined momentum score
    const score = (Math.abs(priceMomentum) * 100 + rsiMomentum + adxMomentum) / 3;
    
    return {
      score,
      bullish: priceMomentum > 0 && rsi > 45,
      bearish: priceMomentum < 0 && rsi < 55
    };
  }
  
  private assessPullbackQuality(candles: Candle[], ind: any): {quality: number} {
    if (candles.length < 5) return {quality: 0};
    
    const recent = candles.slice(-5);
    const fastMA = ind.fastMA;
    
    // Check if price is pulling back to MA after a trend move
    const distances = recent.map(c => Math.abs(c.c - fastMA) / c.c);
    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
    
    // Quality based on: proximity to MA, RSI level, volume pattern
    const proximityScore = Math.max(0, 1 - (avgDistance / 0.005)); // Within 0.5%
    const rsiScore = ind.rsi14 > 35 && ind.rsi14 < 65 ? 1 : 0.5;
    
    const quality = (proximityScore + rsiScore) / 2;
    
    return { quality };
  }
  
  private analyzeVolumeProfile(candles: Candle[]): {trending: boolean} {
    if (candles.length < 5) return {trending: false};
    
    const recent = candles.slice(-5);
    const ranges = recent.map(c => c.h - c.l);
    const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
    const currentRange = recent[recent.length - 1].h - recent[recent.length - 1].l;
    
    // Trending if current range is expanding (volume proxy)
    const trending = currentRange > avgRange * 1.1;
    
    return { trending };
  }
  
  private isBouncingOffSupport(candles: Candle[]): boolean {
    if (candles.length < 3) return false;
    
    const recent = candles.slice(-3);
    const lows = recent.map(c => c.l);
    const minLow = Math.min(...lows);
    const current = recent[recent.length - 1];
    
    // Bounce if touched recent low and now recovering
    return current.l <= minLow * 1.001 && current.c > current.l * 1.002;
  }
  
  private isRejectedAtResistance(candles: Candle[]): boolean {
    if (candles.length < 3) return false;
    
    const recent = candles.slice(-3);
    const highs = recent.map(c => c.h);
    const maxHigh = Math.max(...highs);
    const current = recent[recent.length - 1];
    
    // Rejection if touched recent high and now declining
    return current.h >= maxHigh * 0.999 && current.c < current.h * 0.998;
  }
  
  private checkEMARibbonBreakout(candles: Candle[], direction: 'bullish' | 'bearish'): {signal: boolean, confidence: number} {
    if (candles.length < 8) return {signal: false, confidence: 0};
    
    // Calculate multiple EMAs for ribbon analysis
    const ema8 = this.calculateEMA(candles, 8);
    const ema13 = this.calculateEMA(candles, 13);
    const ema21 = this.calculateEMA(candles, 21);
    
    const current = candles[candles.length - 1];
    
    if (direction === 'bullish') {
      const bullishRibbon = ema8 > ema13 && ema13 > ema21 && current.c > ema8;
      const confidence = bullishRibbon ? 0.75 : 0;
      return {signal: bullishRibbon, confidence};
    } else {
      const bearishRibbon = ema8 < ema13 && ema13 < ema21 && current.c < ema8;
      const confidence = bearishRibbon ? 0.75 : 0;
      return {signal: bearishRibbon, confidence};
    }
  }
  
  private calculateEMA(candles: Candle[], period: number): number {
    if (candles.length < period) return candles[candles.length - 1].c;
    
    const alpha = 2 / (period + 1);
    let ema = candles[0].c;
    
    for (let i = 1; i < candles.length; i++) {
      ema = (candles[i].c * alpha) + (ema * (1 - alpha));
    }
    
    return ema;
  }
} 