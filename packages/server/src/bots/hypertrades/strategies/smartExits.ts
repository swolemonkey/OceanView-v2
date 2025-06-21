import type { MarketRegimeAnalysis } from '../marketRegimeDetector.js';
import type { Candle } from '../perception.js';

export interface ExitSignal {
  shouldExit: boolean;
  reason: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
}

export interface SmartExitConfig {
  volatilityThreshold: number;
  regimeChangeThreshold: number;
  profitTargetMultiplier: number;
  stopLossMultiplier: number;
  timeBasedExitHours: number;
}

export class SmartExitManager {
  private entryRegime: MarketRegimeAnalysis | null = null;
  private entryTime: number | null = null;
  private entryPrice: number | null = null;
  private side: 'buy' | 'sell' | null = null;

  /**
   * Initialize exit manager for a new position
   */
  initializePosition(
    regime: MarketRegimeAnalysis,
    price: number,
    side: 'buy' | 'sell',
    timestamp: number
  ) {
    this.entryRegime = regime;
    this.entryTime = timestamp;
    this.entryPrice = price;
    this.side = side;
  }

  /**
   * Check if position should be exited based on smart conditions
   */
  checkExitConditions(
    currentCandle: Candle,
    currentRegime: MarketRegimeAnalysis,
    atr: number,
    rsi: number,
    config: SmartExitConfig
  ): ExitSignal {
    if (!this.entryRegime || !this.entryTime || !this.entryPrice || !this.side) {
      return { shouldExit: false, reason: 'No position initialized', urgency: 'low', confidence: 0 };
    }

    const currentPrice = currentCandle.c;
    const timeElapsed = currentCandle.ts - this.entryTime;
    const pnlPercent = this.side === 'buy' 
      ? (currentPrice - this.entryPrice) / this.entryPrice
      : (this.entryPrice - currentPrice) / this.entryPrice;

    // 1. REGIME CHANGE EXIT (High Priority)
    const regimeChangeSignal = this.checkRegimeChange(currentRegime, config);
    if (regimeChangeSignal.shouldExit) return regimeChangeSignal;

    // 2. VOLATILITY SPIKE EXIT (High Priority)
    const volatilitySignal = this.checkVolatilitySpike(atr, currentPrice, config);
    if (volatilitySignal.shouldExit) return volatilitySignal;

    // 3. MOMENTUM REVERSAL EXIT (Medium Priority)
    const momentumSignal = this.checkMomentumReversal(rsi, pnlPercent);
    if (momentumSignal.shouldExit) return momentumSignal;

    // 4. PROFIT TARGET EXIT (Medium Priority)
    const profitSignal = this.checkProfitTarget(pnlPercent, atr, config);
    if (profitSignal.shouldExit) return profitSignal;

    // 5. TIME-BASED EXIT (Low Priority)
    const timeSignal = this.checkTimeBasedExit(timeElapsed, pnlPercent, config);
    if (timeSignal.shouldExit) return timeSignal;

    return { shouldExit: false, reason: 'No exit conditions met', urgency: 'low', confidence: 0 };
  }

  private checkRegimeChange(currentRegime: MarketRegimeAnalysis, config: SmartExitConfig): ExitSignal {
    if (!this.entryRegime) {
      return { shouldExit: false, reason: 'No entry regime', urgency: 'low', confidence: 0 };
    }

    // Check if regime has changed significantly
    const regimeChanged = currentRegime.regime !== this.entryRegime.regime;
    const confidenceDropped = currentRegime.confidence < this.entryRegime.confidence * 0.7;

    if (regimeChanged || confidenceDropped) {
      return {
        shouldExit: true,
        reason: `Regime changed: ${this.entryRegime.regime} → ${currentRegime.regime}`,
        urgency: 'high',
        confidence: 0.85
      };
    }

    return { shouldExit: false, reason: 'Regime stable', urgency: 'low', confidence: 0 };
  }

  private checkVolatilitySpike(atr: number, currentPrice: number, config: SmartExitConfig): ExitSignal {
    if (!this.entryPrice) {
      return { shouldExit: false, reason: 'No entry price', urgency: 'low', confidence: 0 };
    }

    const volatilityRatio = atr / currentPrice;
    
    if (volatilityRatio > config.volatilityThreshold) {
      return {
        shouldExit: true,
        reason: `Volatility spike detected: ${(volatilityRatio * 100).toFixed(2)}%`,
        urgency: 'high',
        confidence: 0.8
      };
    }

    return { shouldExit: false, reason: 'Volatility normal', urgency: 'low', confidence: 0 };
  }

  private checkMomentumReversal(rsi: number, pnlPercent: number): ExitSignal {
    if (!this.side) {
      return { shouldExit: false, reason: 'No position side', urgency: 'low', confidence: 0 };
    }

    // For long positions
    if (this.side === 'buy') {
      if (rsi > 75 && pnlPercent > 0.01) { // Overbought with profit
        return {
          shouldExit: true,
          reason: `Momentum reversal: RSI ${rsi.toFixed(1)} (overbought)`,
          urgency: 'medium',
          confidence: 0.7
        };
      }
      if (rsi < 30 && pnlPercent < -0.02) { // Oversold with loss
        return {
          shouldExit: true,
          reason: `Momentum reversal: RSI ${rsi.toFixed(1)} (oversold)`,
          urgency: 'medium',
          confidence: 0.75
        };
      }
    }

    // For short positions
    if (this.side === 'sell') {
      if (rsi < 25 && pnlPercent > 0.01) { // Oversold with profit
        return {
          shouldExit: true,
          reason: `Momentum reversal: RSI ${rsi.toFixed(1)} (oversold)`,
          urgency: 'medium',
          confidence: 0.7
        };
      }
      if (rsi > 70 && pnlPercent < -0.02) { // Overbought with loss
        return {
          shouldExit: true,
          reason: `Momentum reversal: RSI ${rsi.toFixed(1)} (overbought)`,
          urgency: 'medium',
          confidence: 0.75
        };
      }
    }

    return { shouldExit: false, reason: 'Momentum stable', urgency: 'low', confidence: 0 };
  }

  private checkProfitTarget(pnlPercent: number, atr: number, config: SmartExitConfig): ExitSignal {
    if (!this.entryPrice) {
      return { shouldExit: false, reason: 'No entry price', urgency: 'low', confidence: 0 };
    }

    const dynamicProfitTarget = (atr / this.entryPrice) * config.profitTargetMultiplier;
    
    if (pnlPercent > dynamicProfitTarget) {
      return {
        shouldExit: true,
        reason: `Profit target reached: ${(pnlPercent * 100).toFixed(2)}%`,
        urgency: 'medium',
        confidence: 0.6
      };
    }

    return { shouldExit: false, reason: 'Profit target not reached', urgency: 'low', confidence: 0 };
  }

  private checkTimeBasedExit(timeElapsed: number, pnlPercent: number, config: SmartExitConfig): ExitSignal {
    const hoursElapsed = timeElapsed / (1000 * 60 * 60);
    
    if (hoursElapsed > config.timeBasedExitHours) {
      // More aggressive time-based exit if losing
      if (pnlPercent < -0.01) {
        return {
          shouldExit: true,
          reason: `Time-based exit: ${hoursElapsed.toFixed(1)}h elapsed (losing position)`,
          urgency: 'medium',
          confidence: 0.65
        };
      }
      
      // Less aggressive if profitable
      if (hoursElapsed > config.timeBasedExitHours * 1.5) {
        return {
          shouldExit: true,
          reason: `Time-based exit: ${hoursElapsed.toFixed(1)}h elapsed (extended hold)`,
          urgency: 'low',
          confidence: 0.4
        };
      }
    }

    return { shouldExit: false, reason: 'Time limit not reached', urgency: 'low', confidence: 0 };
  }

  /**
   * Reset the exit manager
   */
  reset() {
    this.entryRegime = null;
    this.entryTime = null;
    this.entryPrice = null;
    this.side = null;
  }
} 