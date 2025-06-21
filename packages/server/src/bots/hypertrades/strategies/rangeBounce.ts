import { BaseStrategy, TradeIdea, StrategyCtx } from './baseStrategy.js';
import type { Candle } from '../perception.js';
import { RegimeConfigManager, type RegimeThresholds } from './regimeConfig.js';

export class RangeBounce extends BaseStrategy {
  constructor(symbol: string) {
    super(symbol);
  }

  onCandle(c: Candle, ctx: StrategyCtx): TradeIdea | null {
    const { perception: p, ind, regime } = ctx;
    
    // 🎯 GET DYNAMIC REGIME-SPECIFIC THRESHOLDS
    if (!regime) {
      console.log(`[DEBUG RangeBounce] No regime data available for ${this.symbol}`);
      return null;
    }
    const thresholds = RegimeConfigManager.getFinalThresholds(regime, this.symbol);
    
    // ========================================
    // 🚀 ENHANCED RANGE BOUNCE STRATEGY FOR 5M TIMEFRAMES
    // ========================================
    
    const candles = p.last(100); // More data for better range detection
    if (candles.length < 50) return null;
    
    // 1. SOPHISTICATED RANGE DETECTION
    const rangeAnalysis = this.detectTradingRange(candles);
    if (!rangeAnalysis.inRange) return null;
    
    // 2. MULTI-LEVEL SUPPORT/RESISTANCE
    const supportResistance = this.identifyKeyLevels(candles);
    
    // 3. VOLUME PROFILE ANALYSIS
    const volumeProfile = this.analyzeRangeVolume(candles);
    
    // 4. MOMENTUM DIVERGENCE AT EXTREMES
    const extremeAnalysis = this.analyzeRangeExtremes(candles, ind);
    
    // 5. ORDER FLOW IMBALANCE (simplified)
    const orderFlow = this.assessOrderFlowImbalance(candles);
    
    console.log(`[DEBUG RangeBounce] Range: ${rangeAnalysis.confidence.toFixed(2)}, Support: ${supportResistance.support.toFixed(2)}, Resistance: ${supportResistance.resistance.toFixed(2)}, Volume: ${volumeProfile.atExtremes ? 'extremes' : 'normal'}, Extreme: ${extremeAnalysis.atSupport ? 'support' : extremeAnalysis.atResistance ? 'resistance' : 'middle'}`);
    
    // ENHANCED LONG CONDITIONS (Range Bounce from Support)
    if (rangeAnalysis.inRange && 
        extremeAnalysis.atSupport &&
        volumeProfile.supportingBounce) {
      
      const distanceFromSupport = (c.c - supportResistance.support) / supportResistance.support;
      const rsiOversold = ind.rsi14 < thresholds.rsi.oversold; // DYNAMIC RSI threshold
      const lowVolatility = ind.atr14 / c.c < thresholds.atr.low_volatility_max; // DYNAMIC volatility threshold
      
      // Condition 1: Classic oversold bounce with volume confirmation
      if (rsiOversold && 
          distanceFromSupport < 0.005 && // Within 0.5% of support
          orderFlow.bullishImbalance &&
          lowVolatility) {
        
        console.log(`[DEBUG RangeBounce] LONG signal: Classic oversold bounce at support (regime-adaptive)`);
        return { 
          side: 'buy', 
          price: c.c, 
          reason: `Range bounce oversold support (${regime.regime})`,
          confidence: Math.min(0.95, thresholds.confidence.high_quality + (rangeAnalysis.confidence * 0.15))
        };
      }
      
      // Condition 2: Double bottom pattern at support
      const doubleBottomSignal = this.checkDoubleBottomPattern(candles, supportResistance.support);
      if (doubleBottomSignal.detected && 
          ind.rsi14 < 40 && 
          volumeProfile.confirmingPattern) {
        
        console.log(`[DEBUG RangeBounce] LONG signal: Double bottom at range support`);
        return { 
          side: 'buy', 
          price: c.c, 
          reason: 'Range bounce double bottom pattern',
          confidence: doubleBottomSignal.confidence
        };
      }
      
      // Condition 3: Hidden bullish divergence at support
      const divergenceSignal = this.checkHiddenDivergence(candles, ind.rsi14, 'bullish');
      if (divergenceSignal.detected && 
          distanceFromSupport < 0.003 &&
          extremeAnalysis.bounceQuality > 0.6) {
        
        console.log(`[DEBUG RangeBounce] LONG signal: Hidden bullish divergence at support`);
        return { 
          side: 'buy', 
          price: c.c, 
          reason: 'Range bounce hidden bullish divergence',
          confidence: divergenceSignal.confidence
        };
      }
    }
    
    // ENHANCED SHORT CONDITIONS (Range Bounce from Resistance)
    if (rangeAnalysis.inRange && 
        extremeAnalysis.atResistance &&
        volumeProfile.supportingBounce) {
      
      const distanceFromResistance = (supportResistance.resistance - c.c) / supportResistance.resistance;
      const rsiOverbought = ind.rsi14 > 65;
      const lowVolatility = ind.atr14 / c.c < 0.008; // ATR < 0.8% indicates low volatility range
      
      // Condition 1: Classic overbought rejection with volume confirmation
      if (rsiOverbought && 
          distanceFromResistance < 0.005 && // Within 0.5% of resistance
          orderFlow.bearishImbalance &&
          lowVolatility) {
        
        console.log(`[DEBUG RangeBounce] SHORT signal: Classic overbought rejection at resistance`);
        return { 
          side: 'sell', 
          price: c.c, 
          reason: 'Range bounce overbought at resistance + volume',
          confidence: 0.7 + (rangeAnalysis.confidence * 0.2)
        };
      }
      
      // Condition 2: Double top pattern at resistance
      const doubleTopSignal = this.checkDoubleTopPattern(candles, supportResistance.resistance);
      if (doubleTopSignal.detected && 
          ind.rsi14 > 60 && 
          volumeProfile.confirmingPattern) {
        
        console.log(`[DEBUG RangeBounce] SHORT signal: Double top at range resistance`);
        return { 
          side: 'sell', 
          price: c.c, 
          reason: 'Range bounce double top pattern',
          confidence: doubleTopSignal.confidence
        };
      }
      
      // Condition 3: Hidden bearish divergence at resistance
      const divergenceSignal = this.checkHiddenDivergence(candles, ind.rsi14, 'bearish');
      if (divergenceSignal.detected && 
          distanceFromResistance < 0.003 &&
          extremeAnalysis.bounceQuality > 0.6) {
        
        console.log(`[DEBUG RangeBounce] SHORT signal: Hidden bearish divergence at resistance`);
        return { 
          side: 'sell', 
          price: c.c, 
          reason: 'Range bounce hidden bearish divergence',
          confidence: divergenceSignal.confidence
        };
      }
    }
    
    return null;
  }
  
  // ========================================
  // 🔍 ENHANCED RANGE ANALYSIS METHODS
  // ========================================
  
  private detectTradingRange(candles: Candle[]): {inRange: boolean, confidence: number, duration: number} {
    if (candles.length < 20) return {inRange: false, confidence: 0, duration: 0};
    
    const highs = candles.map(c => c.h);
    const lows = candles.map(c => c.l);
    
    // Calculate potential range levels
    const high = Math.max(...highs);
    const low = Math.min(...lows);
    const rangeSize = (high - low) / low;
    
    // Count touches of range extremes
    const tolerance = rangeSize * 0.1; // 10% of range size
    const highTouches = highs.filter(h => Math.abs(h - high) / high < tolerance).length;
    const lowTouches = lows.filter(l => Math.abs(l - low) / low < tolerance).length;
    
    // Check for range characteristics
    const minTouches = 3;
    const maxRangeSize = 0.06; // 6% max range for 5m timeframes (wider than 1m)
    const minRangeSize = 0.008; // 0.8% min range to avoid noise
    
    const inRange = highTouches >= minTouches && 
                   lowTouches >= minTouches && 
                   rangeSize < maxRangeSize && 
                   rangeSize > minRangeSize;
    
    const confidence = inRange ? 
      Math.min(1.0, (highTouches + lowTouches) / 10) : 0;
    
    const duration = candles.length;
    
    return { inRange, confidence, duration };
  }
  
  private identifyKeyLevels(candles: Candle[]): {support: number, resistance: number, midpoint: number} {
    const highs = candles.map(c => c.h);
    const lows = candles.map(c => c.l);
    
    // Use more sophisticated level identification
    const support = this.calculateSupportLevel(lows);
    const resistance = this.calculateResistanceLevel(highs);
    const midpoint = (support + resistance) / 2;
    
    return { support, resistance, midpoint };
  }
  
  private calculateSupportLevel(lows: number[]): number {
    // Find the most common low level using clustering
    const sortedLows = [...lows].sort((a, b) => a - b);
    const clusters: number[][] = [];
    
    for (const low of sortedLows) {
      let added = false;
      for (const cluster of clusters) {
        if (cluster.length > 0 && Math.abs(low - cluster[0]) / cluster[0] < 0.002) {
          cluster.push(low);
          added = true;
          break;
        }
      }
      if (!added) {
        clusters.push([low]);
      }
    }
    
    // Return the average of the largest cluster
    const largestCluster = clusters.reduce((a, b) => a.length > b.length ? a : b);
    return largestCluster.reduce((sum, val) => sum + val, 0) / largestCluster.length;
  }
  
  private calculateResistanceLevel(highs: number[]): number {
    // Find the most common high level using clustering
    const sortedHighs = [...highs].sort((a, b) => b - a);
    const clusters: number[][] = [];
    
    for (const high of sortedHighs) {
      let added = false;
      for (const cluster of clusters) {
        if (cluster.length > 0 && Math.abs(high - cluster[0]) / cluster[0] < 0.002) {
          cluster.push(high);
          added = true;
          break;
        }
      }
      if (!added) {
        clusters.push([high]);
      }
    }
    
    // Return the average of the largest cluster
    const largestCluster = clusters.reduce((a, b) => a.length > b.length ? a : b);
    return largestCluster.reduce((sum, val) => sum + val, 0) / largestCluster.length;
  }
  
  private analyzeRangeVolume(candles: Candle[]): {atExtremes: boolean, supportingBounce: boolean, confirmingPattern: boolean} {
    if (candles.length < 10) return {atExtremes: false, supportingBounce: false, confirmingPattern: false};
    
    const recent = candles.slice(-10);
    const ranges = recent.map(c => c.h - c.l);
    const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
    const currentRange = recent[recent.length - 1].h - recent[recent.length - 1].l;
    
    // Volume indicators (using range as proxy)
    const atExtremes = currentRange > avgRange * 1.3; // Expanding volume at extremes
    const supportingBounce = currentRange > avgRange * 1.1; // Decent volume for bounce
    const confirmingPattern = ranges.slice(-3).every(r => r > avgRange * 0.9); // Consistent volume
    
    return { atExtremes, supportingBounce, confirmingPattern };
  }
  
  private analyzeRangeExtremes(candles: Candle[], ind: any): {atSupport: boolean, atResistance: boolean, bounceQuality: number} {
    const levels = this.identifyKeyLevels(candles);
    const current = candles[candles.length - 1];
    
    const distanceToSupport = Math.abs(current.c - levels.support) / levels.support;
    const distanceToResistance = Math.abs(current.c - levels.resistance) / levels.resistance;
    
    const atSupport = distanceToSupport < 0.005; // Within 0.5%
    const atResistance = distanceToResistance < 0.005; // Within 0.5%
    
    // Bounce quality based on price action and RSI
    let bounceQuality = 0;
    if (atSupport && current.c > current.l * 1.001) bounceQuality += 0.3; // Bouncing from low
    if (atResistance && current.c < current.h * 0.999) bounceQuality += 0.3; // Rejecting from high
    if (ind.rsi14 < 35 && atSupport) bounceQuality += 0.4; // RSI oversold at support
    if (ind.rsi14 > 65 && atResistance) bounceQuality += 0.4; // RSI overbought at resistance
    
    return { atSupport, atResistance, bounceQuality };
  }
  
  private assessOrderFlowImbalance(candles: Candle[]): {bullishImbalance: boolean, bearishImbalance: boolean} {
    if (candles.length < 5) return {bullishImbalance: false, bearishImbalance: false};
    
    const recent = candles.slice(-5);
    
    // Analyze buying/selling pressure using candle patterns
    let buyPressure = 0;
    let sellPressure = 0;
    
    for (const candle of recent) {
      const bodySize = Math.abs(candle.c - candle.o);
      const totalRange = candle.h - candle.l;
      const bodyRatio = bodySize / totalRange;
      
      if (candle.c > candle.o) { // Bullish candle
        buyPressure += bodyRatio;
      } else { // Bearish candle
        sellPressure += bodyRatio;
      }
    }
    
    const totalPressure = buyPressure + sellPressure;
    const buyRatio = buyPressure / totalPressure;
    const sellRatio = sellPressure / totalPressure;
    
    return {
      bullishImbalance: buyRatio > 0.65,
      bearishImbalance: sellRatio > 0.65
    };
  }
  
  private checkDoubleBottomPattern(candles: Candle[], supportLevel: number): {detected: boolean, confidence: number} {
    if (candles.length < 20) return {detected: false, confidence: 0};
    
    const lows = candles.map(c => c.l);
    const tolerance = supportLevel * 0.003; // 0.3% tolerance
    
    // Find lows near support level
    const supportTouches = lows.filter(low => Math.abs(low - supportLevel) < tolerance);
    
    // Look for double bottom pattern (at least 2 significant lows)
    const detected = supportTouches.length >= 2;
    const confidence = detected ? Math.min(0.8, 0.4 + (supportTouches.length * 0.1)) : 0;
    
    return { detected, confidence };
  }
  
  private checkDoubleTopPattern(candles: Candle[], resistanceLevel: number): {detected: boolean, confidence: number} {
    if (candles.length < 20) return {detected: false, confidence: 0};
    
    const highs = candles.map(c => c.h);
    const tolerance = resistanceLevel * 0.003; // 0.3% tolerance
    
    // Find highs near resistance level
    const resistanceTouches = highs.filter(high => Math.abs(high - resistanceLevel) < tolerance);
    
    // Look for double top pattern (at least 2 significant highs)
    const detected = resistanceTouches.length >= 2;
    const confidence = detected ? Math.min(0.8, 0.4 + (resistanceTouches.length * 0.1)) : 0;
    
    return { detected, confidence };
  }
  
  private checkHiddenDivergence(candles: Candle[], rsi: number, type: 'bullish' | 'bearish'): {detected: boolean, confidence: number} {
    if (candles.length < 10) return {detected: false, confidence: 0};
    
    const recent = candles.slice(-10);
    const prices = recent.map(c => c.c);
    
    // Simplified hidden divergence detection
    if (type === 'bullish') {
      // Price makes higher low, but momentum makes lower low
      const recentLow = Math.min(...prices.slice(-5));
      const prevLow = Math.min(...prices.slice(0, 5));
      const priceHigherLow = recentLow > prevLow;
      const rsiOversold = rsi < 40;
      
      const detected = priceHigherLow && rsiOversold;
      return { detected, confidence: detected ? 0.6 : 0 };
    } else {
      // Price makes lower high, but momentum makes higher high
      const recentHigh = Math.max(...prices.slice(-5));
      const prevHigh = Math.max(...prices.slice(0, 5));
      const priceLowerHigh = recentHigh < prevHigh;
      const rsiOverbought = rsi > 60;
      
      const detected = priceLowerHigh && rsiOverbought;
      return { detected, confidence: detected ? 0.6 : 0 };
    }
  }
} 