import type { Candle } from '../perception.js';

export interface TimeframeAnalysis {
  timeframe: string;
  trend: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  confidence: number;
  supportResistance: {
    support: number;
    resistance: number;
    strength: number;
  };
}

export interface MultiTimeframeSignal {
  alignment: 'strong' | 'moderate' | 'weak' | 'conflicting';
  confidence: number;
  primaryTrend: 'bullish' | 'bearish' | 'neutral';
  recommendation: 'buy' | 'sell' | 'hold';
  reason: string;
}

export class MultiTimeframeAnalyzer {
  private readonly timeframes = ['5m', '15m', '1h', '4h'];
  
  /**
   * Analyze trends across multiple timeframes
   */
  analyzeMultiTimeframe(candles: Candle[]): MultiTimeframeSignal {
    if (candles.length < 50) {
      return {
        alignment: 'weak',
        confidence: 0,
        primaryTrend: 'neutral',
        recommendation: 'hold',
        reason: 'Insufficient data for multi-timeframe analysis'
      };
    }

    const analyses: TimeframeAnalysis[] = [];
    
    // Simulate different timeframe analyses by using different periods
    // 5m (current), 15m (3x period), 1h (12x period), 4h (48x period)
    const periods = [20, 60, 240, 960]; // Approximate candle counts for each timeframe
    
    for (let i = 0; i < this.timeframes.length; i++) {
      const period = Math.min(periods[i], candles.length);
      const timeframeCandles = candles.slice(-period);
      const analysis = this.analyzeTimeframe(this.timeframes[i], timeframeCandles);
      analyses.push(analysis);
    }

    return this.synthesizeAnalyses(analyses);
  }

  /**
   * Analyze trend for a specific timeframe
   */
  private analyzeTimeframe(timeframe: string, candles: Candle[]): TimeframeAnalysis {
    const closes = candles.map(c => c.c);
    const highs = candles.map(c => c.h);
    const lows = candles.map(c => c.l);
    
    // Calculate trend using simple moving averages
    const shortMA = this.calculateSMA(closes, Math.min(10, closes.length - 1));
    const longMA = this.calculateSMA(closes, Math.min(20, closes.length - 1));
    const currentPrice = closes[closes.length - 1];
    
    // Determine trend direction
    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let strength = 0;
    
    if (shortMA > longMA && currentPrice > shortMA) {
      trend = 'bullish';
      strength = Math.min(1, (shortMA - longMA) / longMA);
    } else if (shortMA < longMA && currentPrice < shortMA) {
      trend = 'bearish';
      strength = Math.min(1, (longMA - shortMA) / longMA);
    } else {
      strength = Math.abs(shortMA - longMA) / longMA;
    }
    
    // Calculate support and resistance
    const recentCandles = candles.slice(-20);
    const support = Math.min(...recentCandles.map(c => c.l));
    const resistance = Math.max(...recentCandles.map(c => c.h));
    const srStrength = (resistance - support) / support;
    
    // Calculate confidence based on trend clarity and volume
    const priceRange = Math.max(...closes) - Math.min(...closes);
    const volatility = priceRange / closes[0];
    const confidence = Math.min(1, strength * 2 * (1 - volatility));
    
    return {
      timeframe,
      trend,
      strength: Math.abs(strength),
      confidence,
      supportResistance: {
        support,
        resistance,
        strength: srStrength
      }
    };
  }

  /**
   * Synthesize analyses from all timeframes
   */
  private synthesizeAnalyses(analyses: TimeframeAnalysis[]): MultiTimeframeSignal {
    const bullishCount = analyses.filter(a => a.trend === 'bullish').length;
    const bearishCount = analyses.filter(a => a.trend === 'bearish').length;
    const neutralCount = analyses.filter(a => a.trend === 'neutral').length;
    
    const totalConfidence = analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length;
    const avgStrength = analyses.reduce((sum, a) => sum + a.strength, 0) / analyses.length;
    
    let alignment: 'strong' | 'moderate' | 'weak' | 'conflicting';
    let primaryTrend: 'bullish' | 'bearish' | 'neutral';
    let recommendation: 'buy' | 'sell' | 'hold';
    let reason: string;
    
    // Determine alignment strength
    if (bullishCount >= 3) {
      alignment = 'strong';
      primaryTrend = 'bullish';
      recommendation = totalConfidence > 0.6 ? 'buy' : 'hold';
      reason = `${bullishCount}/4 timeframes bullish (${(totalConfidence * 100).toFixed(1)}% confidence)`;
    } else if (bearishCount >= 3) {
      alignment = 'strong';
      primaryTrend = 'bearish';
      recommendation = totalConfidence > 0.6 ? 'sell' : 'hold';
      reason = `${bearishCount}/4 timeframes bearish (${(totalConfidence * 100).toFixed(1)}% confidence)`;
    } else if (bullishCount === 2 && bearishCount <= 1) {
      alignment = 'moderate';
      primaryTrend = 'bullish';
      recommendation = totalConfidence > 0.7 ? 'buy' : 'hold';
      reason = `Moderate bullish alignment (${bullishCount}/4, conf: ${(totalConfidence * 100).toFixed(1)}%)`;
    } else if (bearishCount === 2 && bullishCount <= 1) {
      alignment = 'moderate';
      primaryTrend = 'bearish';
      recommendation = totalConfidence > 0.7 ? 'sell' : 'hold';
      reason = `Moderate bearish alignment (${bearishCount}/4, conf: ${(totalConfidence * 100).toFixed(1)}%)`;
    } else if (neutralCount >= 2) {
      alignment = 'weak';
      primaryTrend = 'neutral';
      recommendation = 'hold';
      reason = `Neutral/sideways market (${neutralCount}/4 neutral)`;
    } else {
      alignment = 'conflicting';
      primaryTrend = 'neutral';
      recommendation = 'hold';
      reason = `Conflicting signals (${bullishCount}B/${bearishCount}B/${neutralCount}N)`;
    }
    
    // Adjust confidence based on alignment
    let finalConfidence = totalConfidence;
    if (alignment === 'strong') {
      finalConfidence *= 1.2;
    } else if (alignment === 'moderate') {
      finalConfidence *= 1.0;
    } else if (alignment === 'weak') {
      finalConfidence *= 0.8;
    } else {
      finalConfidence *= 0.5;
    }
    
    finalConfidence = Math.min(1, finalConfidence);
    
    return {
      alignment,
      confidence: finalConfidence,
      primaryTrend,
      recommendation,
      reason
    };
  }

  /**
   * Calculate Simple Moving Average
   */
  private calculateSMA(values: number[], period: number): number {
    if (values.length < period) return values[values.length - 1];
    
    const slice = values.slice(-period);
    return slice.reduce((sum, val) => sum + val, 0) / slice.length;
  }

  /**
   * Check if multi-timeframe analysis confirms the signal
   */
  shouldConfirmSignal(signal: 'buy' | 'sell', mtfSignal: MultiTimeframeSignal): boolean {
    // Allow conflicting signals if they have decent confidence
    if (mtfSignal.alignment === 'conflicting' && mtfSignal.confidence < 0.3) {
      return false;
    }
    
    // Check if MTF recommendation aligns with signal (lowered threshold)
    if (signal === 'buy' && mtfSignal.recommendation === 'buy') {
      return mtfSignal.confidence > 0.25; // Lowered from 0.5
    }
    
    if (signal === 'sell' && mtfSignal.recommendation === 'sell') {
      return mtfSignal.confidence > 0.25; // Lowered from 0.5
    }
    
    // Allow moderate alignment with lower confidence
    if (mtfSignal.alignment === 'moderate' && mtfSignal.confidence > 0.4) {
      return true;
    }
    
    // Allow weak signals if MTF is neutral (lowered threshold)
    if (mtfSignal.recommendation === 'hold' && mtfSignal.confidence > 0.5) {
      return true;
    }
    
    return false;
  }
} 