import { createLogger } from '../../utils/logger.js';

const logger = createLogger('market-regime');

/**
 * Market regime types for different trading conditions
 */
export type MarketRegime = 'trending' | 'ranging' | 'volatile' | 'quiet';

/**
 * Enhanced market regime analysis with confidence scoring
 */
export interface MarketRegimeAnalysis {
  regime: MarketRegime;
  confidence: number;
  trendStrength: number;
  volatility: number;
  momentum: number;
  rangeStrength: number;
  regimeScore: number;
  previousRegime?: MarketRegime;
  regimeStability: number; // How long current regime has been active
}

/**
 * Input data for regime detection
 */
export interface RegimeDetectionInput {
  atr: number;           // Average True Range (normalized)
  adx: number;           // Average Directional Index
  rsi: number;           // Relative Strength Index
  bbWidth: number;       // Bollinger Band Width (normalized)
  recentTrend: number;   // Recent trend strength
  currentPrice: number;  // Current price for context
  symbol: string;        // Symbol for logging
}

/**
 * Market Regime Detector with enhanced analysis capabilities
 */
export class MarketRegimeDetector {
  private regimeHistory: MarketRegime[] = [];
  private maxHistory = 10; // Keep last 10 regime detections
  private regimeDuration = 0; // How many periods in current regime
  private lastRegime: MarketRegime | null = null;

  /**
   * Detect market regime with enhanced analysis
   * @param input Market data for regime detection
   * @returns Comprehensive regime analysis
   */
  detectRegime(input: RegimeDetectionInput): MarketRegimeAnalysis {
    const { atr, adx, rsi, bbWidth, recentTrend, currentPrice, symbol } = input;

    // ========================================
    // 🎯 ENHANCED REGIME DETECTION
    // ========================================

    // Normalize all inputs (0-1 scale)
    const normalizedInputs = {
      trendStrength: Math.min(adx / 50, 1),           // ADX 0-50+ -> 0-1
      volatility: Math.min(atr * 100, 1),             // ATR as percentage
      momentum: Math.abs(rsi - 50) / 50,              // RSI deviation from 50
      rangeStrength: Math.min(bbWidth * 5, 1),        // BB width normalized
      trendMomentum: Math.min(Math.abs(recentTrend) * 20, 1)
    };

    // ========================================
    // 🔍 REGIME CLASSIFICATION LOGIC
    // ========================================

    let regime: MarketRegime;
    let regimeScore: number;
    let confidence: number;

    // TRENDING: Strong directional movement
    const trendingScore = (normalizedInputs.trendStrength * 0.4) + 
                         (normalizedInputs.trendMomentum * 0.3) + 
                         (normalizedInputs.momentum * 0.2) +
                         (normalizedInputs.volatility * 0.1);

    // RANGING: Sideways movement with defined boundaries
    const rangingScore = (1 - normalizedInputs.trendStrength) * 0.4 +
                        (normalizedInputs.rangeStrength * 0.3) +
                        ((50 - Math.abs(rsi - 50)) / 50) * 0.2 + // RSI near 50
                        (normalizedInputs.volatility < 0.5 ? 0.3 : 0) * 0.1;

    // VOLATILE: High volatility with unpredictable movements
    const volatileScore = (normalizedInputs.volatility * 0.5) +
                         (normalizedInputs.rangeStrength * 0.3) +
                         (normalizedInputs.momentum * 0.2);

    // QUIET: Low volatility and minimal movement
    const quietScore = (1 - normalizedInputs.volatility) * 0.4 +
                      (1 - normalizedInputs.rangeStrength) * 0.3 +
                      (1 - normalizedInputs.momentum) * 0.2 +
                      (1 - normalizedInputs.trendMomentum) * 0.1;

    // Find dominant regime
    const scores = {
      trending: trendingScore,
      ranging: rangingScore,
      volatile: volatileScore,
      quiet: quietScore
    };

    const maxScore = Math.max(...Object.values(scores));
    regime = Object.keys(scores).find(key => scores[key as keyof typeof scores] === maxScore) as MarketRegime;
    regimeScore = maxScore;
    confidence = this.calculateConfidence(regime, scores, normalizedInputs);

    // ========================================
    // 🔄 REGIME STABILITY TRACKING
    // ========================================

    // Track regime changes and stability
    if (this.lastRegime === regime) {
      this.regimeDuration++;
    } else {
      this.regimeHistory.push(regime);
      if (this.regimeHistory.length > this.maxHistory) {
        this.regimeHistory.shift();
      }
      this.regimeDuration = 1;
      this.lastRegime = regime;
    }

    const regimeStability = Math.min(this.regimeDuration / 5, 1); // Stability increases over 5 periods

    // Create comprehensive analysis
    const analysis: MarketRegimeAnalysis = {
      regime,
      confidence,
      trendStrength: normalizedInputs.trendStrength,
      volatility: normalizedInputs.volatility,
      momentum: normalizedInputs.momentum,
      rangeStrength: normalizedInputs.rangeStrength,
      regimeScore,
      previousRegime: this.regimeHistory[this.regimeHistory.length - 2],
      regimeStability
    };

    // Log regime detection with detailed metrics
    logger.debug(`🎯 REGIME DETECTION: ${symbol} | ${regime.toUpperCase()} (${(confidence * 100).toFixed(1)}%) | Scores: T=${trendingScore.toFixed(2)}, R=${rangingScore.toFixed(2)}, V=${volatileScore.toFixed(2)}, Q=${quietScore.toFixed(2)} | Stability: ${(regimeStability * 100).toFixed(1)}%`, {
      service: 'oceanview',
      symbol,
      regime,
      confidence,
      scores,
      stability: regimeStability,
      duration: this.regimeDuration,
      inputs: normalizedInputs
    });

    return analysis;
  }

  /**
   * Calculate confidence in regime detection
   * @param regime Detected regime
   * @param scores All regime scores
   * @param inputs Normalized inputs
   * @returns Confidence score (0-1)
   */
  private calculateConfidence(
    regime: MarketRegime, 
    scores: Record<string, number>, 
    inputs: any
  ): number {
    const regimeScore = scores[regime];
    const secondHighest = Object.values(scores)
      .filter(score => score !== regimeScore)
      .sort((a, b) => b - a)[0];

    // Base confidence from score separation
    const scoreSeparation = regimeScore - (secondHighest || 0);
    let confidence = Math.min(scoreSeparation * 2, 1); // Scale separation to 0-1

    // Boost confidence for clear indicators
    switch (regime) {
      case 'trending':
        if (inputs.trendStrength > 0.7 && inputs.trendMomentum > 0.5) {
          confidence = Math.min(confidence * 1.2, 1);
        }
        break;
      case 'ranging':
        if (inputs.trendStrength < 0.3 && inputs.rangeStrength > 0.5) {
          confidence = Math.min(confidence * 1.15, 1);
        }
        break;
      case 'volatile':
        if (inputs.volatility > 0.8) {
          confidence = Math.min(confidence * 1.1, 1);
        }
        break;
      case 'quiet':
        if (inputs.volatility < 0.2 && inputs.momentum < 0.3) {
          confidence = Math.min(confidence * 1.1, 1);
        }
        break;
    }

    // Reduce confidence for regime instability
    if (this.regimeDuration < 3) {
      confidence *= 0.8; // Lower confidence for new regimes
    }

    return Math.max(0.3, Math.min(confidence, 1)); // Ensure reasonable bounds
  }

  /**
   * Get regime-adjusted trading parameters
   * @param regime Market regime
   * @param confidence Regime confidence
   * @param strategyName Strategy name
   * @returns Adjusted parameters
   */
  getRegimeAdjustments(
    regime: MarketRegime, 
    confidence: number, 
    strategyName: string
  ): {
    rrMultiplier: number;
    positionSizeMultiplier: number;
    stopDistanceMultiplier: number;
    targetExtensionMultiplier: number;
    maxTradesPerHour: number;
  } {
    const baseAdjustments = {
      trending: {
        rrMultiplier: 0.85,          // Lower RR requirements in trends
        positionSizeMultiplier: 1.1,  // Slightly larger positions
        stopDistanceMultiplier: 1.2,  // Wider stops for trend following
        targetExtensionMultiplier: 1.4, // Extended targets
        maxTradesPerHour: 3
      },
      ranging: {
        rrMultiplier: 1.1,           // Higher RR in ranges
        positionSizeMultiplier: 0.9,  // Smaller positions
        stopDistanceMultiplier: 0.9,  // Tighter stops
        targetExtensionMultiplier: 1.0, // Standard targets
        maxTradesPerHour: 4
      },
      volatile: {
        rrMultiplier: 1.2,           // Much higher RR in volatility
        positionSizeMultiplier: 0.8,  // Smaller positions for safety
        stopDistanceMultiplier: 1.3,  // Much wider stops
        targetExtensionMultiplier: 1.1, // Slightly extended targets
        maxTradesPerHour: 2
      },
      quiet: {
        rrMultiplier: 0.9,           // Slightly lower RR in quiet markets
        positionSizeMultiplier: 1.0,  // Standard positions
        stopDistanceMultiplier: 0.8,  // Tighter stops
        targetExtensionMultiplier: 0.9, // Shorter targets
        maxTradesPerHour: 2
      }
    };

    const adjustments = baseAdjustments[regime];

    // Apply confidence weighting (higher confidence = stronger adjustments)
    const confidenceWeight = confidence;
    
    return {
      rrMultiplier: 1 + (adjustments.rrMultiplier - 1) * confidenceWeight,
      positionSizeMultiplier: 1 + (adjustments.positionSizeMultiplier - 1) * confidenceWeight,
      stopDistanceMultiplier: 1 + (adjustments.stopDistanceMultiplier - 1) * confidenceWeight,
      targetExtensionMultiplier: 1 + (adjustments.targetExtensionMultiplier - 1) * confidenceWeight,
      maxTradesPerHour: Math.round(adjustments.maxTradesPerHour * (0.5 + confidenceWeight * 0.5))
    };
  }

  /**
   * Get current regime statistics
   * @returns Regime statistics
   */
  getRegimeStats(): {
    currentDuration: number;
    regimeHistory: MarketRegime[];
    stability: number;
  } {
    return {
      currentDuration: this.regimeDuration,
      regimeHistory: [...this.regimeHistory],
      stability: Math.min(this.regimeDuration / 5, 1)
    };
  }

  /**
   * Reset regime tracking (useful for new trading sessions)
   */
  reset(): void {
    this.regimeHistory = [];
    this.regimeDuration = 0;
    this.lastRegime = null;
    
    logger.info('🔄 REGIME DETECTOR: Reset regime tracking', {
      service: 'oceanview'
    });
  }
} 