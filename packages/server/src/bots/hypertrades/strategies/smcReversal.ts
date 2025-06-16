import { BaseStrategy, TradeIdea, StrategyCtx } from './baseStrategy';
import type { Candle } from '../perception';

export class SMCReversal extends BaseStrategy {
  onCandle(c: Candle, ctx: StrategyCtx): TradeIdea|null {
    const { ind, perception, cfg } = ctx;
    
    // Get last 3 candles
    const candles = perception.last(3);
    if (candles.length < 3) {
      console.log(`[DEBUG SMC] Not enough candles for ${this.symbol}, need 3, got ${candles.length}`);
      return null;
    }
    
    const [prev2, prev1, current] = candles;
    console.log(`[DEBUG SMC] Processing candle for ${this.symbol}, candles length: ${candles.length}`);
    console.log(`[DEBUG SMC] Candles: 
      C1: l=${prev2.l}, h=${prev2.h}, c=${prev2.c}
      C2: l=${prev1.l}, h=${prev1.h}, c=${prev1.c}
      C3: l=${current.l}, h=${current.h}, c=${current.c}`);
    
    // Check RSI
    console.log(`[DEBUG SMC] RSI: ${ind.rsi14}, threshold: ${cfg.ta.overSold}`);
    
    // Detect patterns
    const down = prev1.l < prev2.l && current.c > prev1.h;
    const up = prev1.h > prev2.h && current.c < prev1.l;
    console.log(`[DEBUG SMC] Down pattern: ${down}, Up pattern: ${up}`);
    
    // Log thresholds
    console.log(`[DEBUG SMC] SMC threshold: ${cfg.smc.thresh}, minRetrace: ${cfg.smc.minRetrace}`);
    
    if (down) {
      const retraceAmount = (current.c - prev1.l) / (prev2.l - prev1.l);
      console.log(`[DEBUG SMC] Retrace amount for down: ${retraceAmount}, need: ${cfg.smc.minRetrace}`);
      
      if (retraceAmount >= cfg.smc.minRetrace && ind.rsi14 < cfg.ta.overSold) {
        console.log(`[DEBUG SMC] LONG signal triggered! RSI: ${ind.rsi14} < ${cfg.ta.overSold}`);
        return { side: 'buy', price: c.c, reason: 'SMC stop‑hunt long' };
      }
    }
    
    if (up) {
      const retraceAmount = (prev1.h - current.c) / (prev1.h - prev2.h);
      console.log(`[DEBUG SMC] Retrace amount for up: ${retraceAmount}, need: ${cfg.smc.minRetrace}`);
      
      if (retraceAmount >= cfg.smc.minRetrace && ind.rsi14 > cfg.ta.overBought) {
        console.log(`[DEBUG SMC] SHORT signal triggered! RSI: ${ind.rsi14} > ${cfg.ta.overBought}`);
        return { side: 'sell', price: c.c, reason: 'SMC stop‑hunt short' };
      }
    }
    
    return null;
  }
} 