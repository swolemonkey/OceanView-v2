import { BaseStrategy, TradeIdea, StrategyCtx } from './baseStrategy.js';
import type { Candle } from '../perception.js';

export class SMCReversal extends BaseStrategy {
  constructor(symbol: string) {
    super(symbol);
  }

  onCandle(c: Candle, ctx: StrategyCtx): TradeIdea|null {
    const { ind, perception, cfg } = ctx;
    
    // Get last 5 candles for more sophisticated analysis
    const candles = perception.last(5);
    if (candles.length < 5) {
      console.log(`[DEBUG SMC] Not enough candles, need 5, got ${candles.length}`);
      return null;
    }
    
    const [prev4, prev3, prev2, prev1, current] = candles;
    console.log(`[DEBUG SMC] Processing candle with 5-candle pattern`);
    
    // ========================================
    // 🚀 ENHANCED SMC REVERSAL STRATEGY FOR 5M TIMEFRAMES
    // ========================================
    
    // 1. LIQUIDITY SWEEP DETECTION (Enhanced)
    const liquiditySweep = this.detectLiquiditySweep(candles);
    
    // 2. ORDER BLOCK IDENTIFICATION
    const orderBlock = this.identifyOrderBlock(candles);
    
    // 3. MARKET STRUCTURE SHIFT
    const structureShift = this.detectMarketStructureShift(candles);
    
    // 4. VOLUME PROFILE ANALYSIS (Simplified using range analysis)
    const volumeConfirmation = this.analyzeVolumeProfile(candles);
    
    // 5. MOMENTUM DIVERGENCE
    const momentumDivergence = this.checkMomentumDivergence(candles, ind.rsi14);
    
    console.log(`[DEBUG SMC] Analysis: LiqSweep=${liquiditySweep.detected}, OrderBlock=${orderBlock.detected}, StructShift=${structureShift.detected}, Volume=${volumeConfirmation.bullish ? 'bullish' : volumeConfirmation.bearish ? 'bearish' : 'neutral'}, MomDiv=${momentumDivergence.bullish ? 'bullish' : momentumDivergence.bearish ? 'bearish' : 'none'}`);
    
    // BULLISH SMC REVERSAL CONDITIONS
    if (liquiditySweep.bearish && // Swept below recent lows
        orderBlock.bullish &&     // Found bullish order block
        structureShift.bullish && // Market structure shifting bullish
        volumeConfirmation.bullish && // Volume supporting bullish move
        ind.rsi14 < cfg.ta.overSold + 5) { // RSI oversold (slightly relaxed for 5m)
      
      console.log(`[DEBUG SMC] BULLISH SMC REVERSAL signal triggered!`);
      return { 
        side: 'buy', 
        price: c.c, 
        reason: 'SMC bullish reversal - liquidity sweep + order block',
        confidence: this.calculateConfidence([liquiditySweep, orderBlock, structureShift, volumeConfirmation, momentumDivergence], 'bullish')
      };
    }
    
    // BEARISH SMC REVERSAL CONDITIONS  
    if (liquiditySweep.bullish && // Swept above recent highs
        orderBlock.bearish &&     // Found bearish order block
        structureShift.bearish && // Market structure shifting bearish
        volumeConfirmation.bearish && // Volume supporting bearish move
        ind.rsi14 > cfg.ta.overBought - 5) { // RSI overbought (slightly relaxed for 5m)
      
      console.log(`[DEBUG SMC] BEARISH SMC REVERSAL signal triggered!`);
      return { 
        side: 'sell', 
        price: c.c, 
        reason: 'SMC bearish reversal - liquidity sweep + order block',
        confidence: this.calculateConfidence([liquiditySweep, orderBlock, structureShift, volumeConfirmation, momentumDivergence], 'bearish')
      };
    }
    
    return null;
  }
  
  // ========================================
  // 🔍 ENHANCED SMC ANALYSIS METHODS
  // ========================================
  
  private detectLiquiditySweep(candles: Candle[]): {detected: boolean, bullish: boolean, bearish: boolean} {
    if (candles.length < 5) return {detected: false, bullish: false, bearish: false};
    
    const [prev4, prev3, prev2, prev1, current] = candles;
    
    // Look for liquidity sweep patterns
    const recentLow = Math.min(prev4.l, prev3.l, prev2.l, prev1.l);
    const recentHigh = Math.max(prev4.h, prev3.h, prev2.h, prev1.h);
    
    // Bearish liquidity sweep (sweep below lows then recover)
    const bearishSweep = current.l < recentLow * 0.9995 && current.c > recentLow * 1.0005;
    
    // Bullish liquidity sweep (sweep above highs then reject)
    const bullishSweep = current.h > recentHigh * 1.0005 && current.c < recentHigh * 0.9995;
    
    return {
      detected: bearishSweep || bullishSweep,
      bullish: false, // We want bearish sweep for bullish reversal
      bearish: bearishSweep
    };
  }
  
  private identifyOrderBlock(candles: Candle[]): {detected: boolean, bullish: boolean, bearish: boolean} {
    if (candles.length < 4) return {detected: false, bullish: false, bearish: false};
    
    const [prev3, prev2, prev1, current] = candles.slice(-4);
    
    // Bullish order block: strong down candle followed by rejection
    const bullishOrderBlock = 
      prev2.c < prev2.o && // Strong bearish candle
      (prev2.o - prev2.c) / prev2.o > 0.002 && // At least 0.2% move
      prev1.c > prev1.o && // Bullish rejection
      current.c > prev1.h; // Continuation higher
    
    // Bearish order block: strong up candle followed by rejection  
    const bearishOrderBlock =
      prev2.c > prev2.o && // Strong bullish candle
      (prev2.c - prev2.o) / prev2.o > 0.002 && // At least 0.2% move
      prev1.c < prev1.o && // Bearish rejection
      current.c < prev1.l; // Continuation lower
    
    return {
      detected: bullishOrderBlock || bearishOrderBlock,
      bullish: bullishOrderBlock,
      bearish: bearishOrderBlock
    };
  }
  
  private detectMarketStructureShift(candles: Candle[]): {detected: boolean, bullish: boolean, bearish: boolean} {
    if (candles.length < 5) return {detected: false, bullish: false, bearish: false};
    
    const highs = candles.map(c => c.h);
    const lows = candles.map(c => c.l);
    
    // Bullish structure shift: breaking above recent highs with momentum
    const bullishShift = 
      highs[4] > Math.max(...highs.slice(0, 4)) && // New high
      candles[4].c > candles[3].c; // Momentum confirmation
    
    // Bearish structure shift: breaking below recent lows with momentum
    const bearishShift =
      lows[4] < Math.min(...lows.slice(0, 4)) && // New low
      candles[4].c < candles[3].c; // Momentum confirmation
    
    return {
      detected: bullishShift || bearishShift,
      bullish: bullishShift,
      bearish: bearishShift
    };
  }
  
  private analyzeVolumeProfile(candles: Candle[]): {bullish: boolean, bearish: boolean} {
    // Simplified volume analysis using price action as proxy
    const current = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    
    if (!current || !prev) return {bullish: false, bearish: false};
    
    // Use range as volume proxy
    const currentRange = current.h - current.l;
    const prevRange = prev.h - prev.l;
    const rangeExpansion = currentRange > prevRange * 1.2;
    
    // Bullish volume: expanding range with bullish close
    const bullishVolume = rangeExpansion && current.c > (current.h + current.l) / 2;
    
    // Bearish volume: expanding range with bearish close
    const bearishVolume = rangeExpansion && current.c < (current.h + current.l) / 2;
    
    return {
      bullish: bullishVolume,
      bearish: bearishVolume
    };
  }
  
  private checkMomentumDivergence(candles: Candle[], rsi: number): {bullish: boolean, bearish: boolean} {
    if (candles.length < 3) return {bullish: false, bearish: false};
    
    const prices = candles.map(c => c.c);
    const current = prices[prices.length - 1];
    const prev = prices[prices.length - 2];
    const prev2 = prices[prices.length - 3];
    
    // Simplified momentum divergence
    // Bullish divergence: price making lower lows but RSI above 30
    const bullishDiv = current < prev && prev < prev2 && rsi > 35;
    
    // Bearish divergence: price making higher highs but RSI below 70
    const bearishDiv = current > prev && prev > prev2 && rsi < 65;
    
    return {
      bullish: bullishDiv,
      bearish: bearishDiv
    };
  }
  
  private calculateConfidence(factors: Array<{bullish?: boolean, bearish?: boolean}>, direction: 'bullish' | 'bearish'): number {
    const relevantFactors = factors.filter(f => f[direction] === true);
    return Math.min(1.0, 0.5 + (relevantFactors.length * 0.1)); // Base 50% + 10% per confirming factor
  }
} 