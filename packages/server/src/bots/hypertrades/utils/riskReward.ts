import { prisma } from '../../../db.js';

/**
 * Calculate rolling win probability from recent trades for the symbol
 * @param symbol The trading symbol to analyze
 * @param lookbackTrades Number of recent trades to analyze (default: 30)
 * @returns Promise<number> Win probability between 0 and 1
 */
export async function getWinProb(symbol: string, lookbackTrades: number = 20): Promise<number> {
  try {
    const recentTrades = await prisma.strategyTrade.findMany({
      where: { symbol },
      orderBy: { ts: 'desc' },
      take: lookbackTrades
    });

    if (recentTrades.length === 0) {
      return 0.60; // Default 60% for 5m trading (higher confidence than 1m)
    }

    const winningTrades = recentTrades.filter(trade => trade.pnl > 0).length;
    const winProb = winningTrades / recentTrades.length;
    
    return winProb;
  } catch (error) {
    console.error('Error calculating win probability:', error);
    return 0.60; // Default fallback for 5m trading
  }
}

/**
 * Calculate dynamic risk-reward threshold optimized for 5-minute trading
 * @param winProb Win probability from recent trades (0-1)
 * @param volatility Market volatility factor (optional)
 * @param trendStrength Trend strength factor (optional)
 * @returns Dynamic risk-reward threshold
 */
export function getDynamicRRThreshold(winProb: number, volatility: number = 0.005, trendStrength: number = 0.005): number {
  // ========================================
  // 🎯 OPTIMIZED RISK-REWARD FOR 5M TRADING
  // ========================================
  
  // Base threshold from win rate (balanced for backtests - prevent bad trades but allow testing)
  let baseThreshold: number;
  if (winProb > 0.70) {
    baseThreshold = 0.9;  // Very high win rate = permissive but not too loose
  } else if (winProb > 0.60) {
    baseThreshold = 1.1;  // High win rate = moderate
  } else if (winProb > 0.50) {
    baseThreshold = 1.3;  // Medium win rate = balanced
  } else if (winProb > 0.40) {
    baseThreshold = 1.5;  // Low win rate = stricter
  } else {
    baseThreshold = 1.7;  // Very low win rate = strict
  }
  
  // Volatility adjustment for 5m timeframes - less sensitive than 1m
  const volatilityAdjustment = volatility > 0.008 ? -0.25 : (volatility < 0.003 ? 0.15 : 0);
  
  // Trend strength adjustment for 5m - stronger trends allow tighter RR
  const trendAdjustment = trendStrength > 0.008 ? -0.2 : (trendStrength < 0.002 ? 0.15 : 0);
  
  // Time-of-day adjustment for 5m trading (simplified)
  const hour = new Date().getUTCHours();
  const timeAdjustment = (hour >= 13 && hour <= 17) ? -0.1 : 0; // NY session = more permissive
  
  // Calculate final threshold (wider range for 5m trading)
  const finalThreshold = Math.max(0.7, Math.min(2.0, baseThreshold + volatilityAdjustment + trendAdjustment + timeAdjustment));
  
  return finalThreshold;
}

/**
 * Enhanced risk-reward check optimized for 5-minute trading with adaptive thresholds
 * @param side Trade side (buy/sell)
 * @param entry Entry price
 * @param stop Stop loss price
 * @param target Target price
 * @param symbol Trading symbol for win rate calculation
 * @param volatility Market volatility factor (optional)
 * @param trendStrength Trend strength factor (optional)
 * @param strategyName Strategy name for specific RR curves (optional)
 * @returns Promise<{passed: boolean, rr: number, threshold: number, winProb: number, adjustments: object}>
 */
export async function passRRDynamic(
  side: 'buy' | 'sell', 
  entry: number, 
  stop: number, 
  target: number, 
  symbol: string,
  volatility: number = 0.005,
  trendStrength: number = 0.005,
  strategyName: string = 'default'
): Promise<{
  passed: boolean, 
  rr: number, 
  threshold: number, 
  winProb: number,
      adjustments: {
      volatilityAdjustment: number,
      trendAdjustment: number,
      timeAdjustment: number,
      baseThreshold: number,
      strategyName: string,
      regime: MarketRegime,
      regimeMultiplier: number,
      regimeConfidence: number
    }
}> {
  const rr = Math.abs((target - entry) / (entry - stop));
  const winProb = await getWinProb(symbol, 40); // More trade history for 5m analysis
  
  // Use strategy-specific RR threshold
  const baseThreshold = getStrategyRRThreshold(strategyName, winProb);
  
  // Market regime detection (requires additional parameters)
  // For now, use simplified regime detection based on available data
  const adx = 25; // Default ADX (would need to be passed in)
  const rsi = 50; // Default RSI (would need to be passed in) 
  const bbWidth = volatility; // Use volatility as proxy for BB width
  const regimeAnalysis = detectMarketRegime(adx, volatility, rsi, bbWidth, trendStrength);
  const regimeMultiplier = getRegimeRRMultiplier(regimeAnalysis.regime, strategyName);
  
  const volatilityAdjustment = volatility > 0.008 ? -0.25 : (volatility < 0.003 ? 0.15 : 0);
  const trendAdjustment = trendStrength > 0.008 ? -0.2 : (trendStrength < 0.002 ? 0.15 : 0);
  
  // Time-of-day adjustment for 5m trading
  const hour = new Date().getUTCHours();
  const timeAdjustment = (hour >= 13 && hour <= 17) ? -0.1 : 0; // NY session
  
  // Apply regime multiplier to base threshold
  const regimeAdjustedThreshold = baseThreshold * regimeMultiplier;
  const threshold = Math.max(0.5, Math.min(2.5, regimeAdjustedThreshold + volatilityAdjustment + trendAdjustment + timeAdjustment));
  
  return {
    passed: rr >= threshold,
    rr,
    threshold,
    winProb,
    adjustments: {
      volatilityAdjustment,
      trendAdjustment,
      timeAdjustment,
      baseThreshold,
      strategyName,
      regime: regimeAnalysis.regime,
      regimeMultiplier,
      regimeConfidence: regimeAnalysis.confidence
    }
  };
}

/**
 * Quick scalping risk-reward check for very short-term trades
 * @param side Trade side (buy/sell)
 * @param entry Entry price
 * @param stop Stop loss price
 * @param target Target price
 * @param minRR Minimum risk-reward ratio (default: 0.8 for scalping)
 * @returns {passed: boolean, rr: number}
 */
export function passScalpingRR(side:'buy'|'sell', entry:number, stop:number, target:number, minRR=0.8): {passed: boolean, rr: number} {
  const rr = Math.abs((target - entry) / (entry - stop));
  return {
    passed: rr >= minRR,
    rr
  };
}

/**
 * Adaptive position sizing for 5-minute trading
 * @param baseSize Base position size
 * @param confidence Signal confidence (0-1)
 * @param volatility Market volatility
 * @param timeOfDay Current hour (0-23)
 * @returns Adjusted position size
 */
export function calculateScalpingSize(
  baseSize: number, 
  confidence: number = 1.0, 
  volatility: number = 0.005,
  timeOfDay: number = new Date().getUTCHours()
): number {
  // Confidence adjustment
  const confidenceMultiplier = Math.max(0.5, Math.min(1.5, confidence));
  
  // Volatility adjustment (reduce size in high volatility)
  const volMultiplier = volatility > 0.01 ? 0.7 : (volatility < 0.003 ? 1.2 : 1.0);
  
  // Time-of-day adjustment (reduce size during low liquidity hours)
  const timeMultiplier = (timeOfDay >= 13 && timeOfDay <= 17) ? 1.1 : 0.9; // NY session boost
  
  // Calculate final size
  const adjustedSize = baseSize * confidenceMultiplier * volMultiplier * timeMultiplier;
  
  return Math.max(baseSize * 0.3, Math.min(baseSize * 2.0, adjustedSize));
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use passRRDynamic or pass5MinuteRR for 5m timeframes
 */
export function passRR(side:'buy'|'sell', entry:number, stop:number, target:number, minRR=1.3){
  const rr=Math.abs((target-entry)/(entry-stop));
  return rr>=minRR;
}

/**
 * Fee-aware risk/reward check - accounts for trading fees in the calculation
 * @param side Trade side (buy/sell)
 * @param entry Entry price
 * @param stop Stop loss price  
 * @param target Target price
 * @param minRR Minimum risk/reward ratio required
 * @param feeRate Fee rate per trade side (default: 0.0004 = 0.04%)
 * @returns Object with pass/fail result, net R:R ratio, and fee impact
 */
export function passRRFeeAware(
  side: 'buy' | 'sell', 
  entry: number, 
  stop: number, 
  target: number, 
  minRR: number = 1.3,
  feeRate: number = 0.0004
): {
  passed: boolean;
  netRR: number;
  grossRR: number;
  feeImpact: number;
  netReward: number;
  netRisk: number;
} {
  // Calculate gross risk and reward
  const grossRisk = Math.abs(entry - stop);
  const grossReward = Math.abs(target - entry);
  const grossRR = grossReward / grossRisk;
  
  // Calculate fee costs
  const entryFee = entry * feeRate;  // Fee on entry
  const exitFee = entry * feeRate;   // Estimated fee on exit (using entry price as approximation)
  const totalFees = entryFee + exitFee;
  
  // Calculate net risk and reward after fees
  const netRisk = grossRisk + entryFee;      // Add entry fee to risk (we pay this immediately)
  const netReward = grossReward - exitFee;   // Subtract exit fee from reward (we'll pay this on exit)
  
  // Calculate net risk/reward ratio
  const netRR = netReward / netRisk;
  
  // Calculate fee impact as percentage reduction
  const feeImpact = ((grossRR - netRR) / grossRR) * 100;
  
  // Check if net R:R meets minimum threshold
  const passed = netRR >= minRR;
  
  return {
    passed,
    netRR,
    grossRR,
    feeImpact,
    netReward,
    netRisk
  };
}

/**
 * Enhanced fee-aware R:R check with minimum profit threshold
 * @param side Trade side
 * @param entry Entry price
 * @param stop Stop loss price
 * @param target Target price
 * @param minRR Minimum risk/reward ratio
 * @param feeRate Fee rate per side
 * @param minProfitPct Minimum profit percentage to justify trade (default: 0.2%)
 * @returns Enhanced analysis including profit adequacy check
 */
export function passRRFeeAwareEnhanced(
  side: 'buy' | 'sell',
  entry: number,
  stop: number, 
  target: number,
  minRR: number = 1.3,
  feeRate: number = 0.0004,
  minProfitPct: number = 0.002  // 0.2% minimum profit
): {
  passed: boolean;
  netRR: number;
  grossRR: number;
  feeImpact: number;
  profitPct: number;
  profitAdequate: boolean;
  reason: string;
} {
  // Get basic fee-aware analysis
  const basic = passRRFeeAware(side, entry, stop, target, minRR, feeRate);
  
  // Calculate profit percentage
  const profitPct = basic.netReward / entry;
  const profitAdequate = profitPct >= minProfitPct;
  
  // Determine overall pass/fail and reason
  let passed = basic.passed && profitAdequate;
  let reason = '';
  
  if (!basic.passed && !profitAdequate) {
    reason = 'R:R too low AND profit too small';
  } else if (!basic.passed) {
    reason = 'R:R too low after fees';
  } else if (!profitAdequate) {
    reason = 'Profit too small to justify fees';
  } else {
    reason = 'Passed all checks';
  }
  
  return {
    passed,
    netRR: basic.netRR,
    grossRR: basic.grossRR,
    feeImpact: basic.feeImpact,
    profitPct: profitPct * 100, // Convert to percentage
    profitAdequate,
    reason
  };
}

// ========================================
// 🎯 5-MINUTE TIMEFRAME RISK-REWARD OPTIMIZATION
// ========================================

// Base thresholds optimized for 5-minute timeframes
const BASE_THRESHOLDS = {
  conservative: 1.2,    // More conservative base for 5m (was 0.8 for 1m)
  moderate: 1.6,        // Moderate threshold for 5m (was 1.2 for 1m)  
  aggressive: 2.0       // Higher aggressive threshold for 5m (was 1.6 for 1m)
};

// Default parameters for 5-minute optimization
const DEFAULT_WIN_PROBABILITY = 0.60;  // Higher target win rate for 5m (was 0.55 for 1m)
const VOLATILITY_LOOKBACK = 20;        // Longer lookback for 5m volatility (was 15 for 1m)
const TRADE_HISTORY_LOOKBACK = 40;     // More trade history for 5m analysis (was 30 for 1m)

export function calculateDynamicRR(
  symbol: string,
  currentPrice: number,
  volatility: number,
  timeOfDay: string = 'default',
  recentTrades: any[] = []
): number {
  // Base calculation with 5m adjustments
  let baseRR = BASE_THRESHOLDS.moderate;
  
  // === VOLATILITY ADJUSTMENTS (5m Optimized) ===
  if (volatility > 0.025) {
    baseRR += 0.4;  // Higher adjustment for high volatility in 5m (was 0.3 for 1m)
  } else if (volatility > 0.015) {
    baseRR += 0.2;  // Moderate adjustment for medium volatility
  } else if (volatility < 0.008) {
    baseRR -= 0.2;  // Lower RR in low volatility 5m periods (was -0.15 for 1m)
  }
  
  // === TIME-OF-DAY ADJUSTMENTS (5m Specific) ===
  switch (timeOfDay) {
    case 'asian':
      baseRR += 0.15;  // Higher RR during Asian session (lower volatility)
      break;
    case 'london':
      baseRR += 0.05;  // Slight increase during London session
      break;
    case 'ny':
      baseRR -= 0.1;   // Lower RR during high-volatility NY session
      break;
    case 'overlap':
      baseRR -= 0.15;  // Lowest RR during session overlaps (highest volatility)
      break;
  }
  
  // === RECENT PERFORMANCE ADJUSTMENTS ===
  if (recentTrades.length >= 10) {
    const recentWinRate = recentTrades.slice(0, TRADE_HISTORY_LOOKBACK)
      .filter(t => t.pnl > 0).length / Math.min(recentTrades.length, TRADE_HISTORY_LOOKBACK);
    
    if (recentWinRate < 0.45) {
      baseRR += 0.3;  // Increase RR if recent win rate is poor
    } else if (recentWinRate > 0.70) {
      baseRR -= 0.2;  // Decrease RR if recent win rate is excellent
    }
  }
  
  // === SYMBOL-SPECIFIC ADJUSTMENTS ===
  if (symbol.includes('BTC') || symbol.includes('bitcoin')) {
    baseRR += 0.1;  // Slightly higher RR for BTC due to volatility
  }
  
  // Ensure reasonable bounds for 5m trading
  return Math.max(1.2, Math.min(2.5, baseRR));  // Wider bounds for 5m (was 0.8-2.0 for 1m)
}

export function passRiskReward(
  entryPrice: number,
  stopPrice: number,
  targetPrice: number,
  symbol: string = '',
  confidence: number = 0.7,  // Higher default confidence for 5m
  marketConditions: any = {}
): boolean {
  const riskAmount = Math.abs(entryPrice - stopPrice);
  const rewardAmount = Math.abs(targetPrice - entryPrice);
  const currentRR = rewardAmount / riskAmount;
  
  // Calculate dynamic threshold based on 5m conditions
  const volatility = marketConditions.volatility || 0.015;  // Default 5m volatility
  const timeOfDay = marketConditions.timeOfDay || 'default';
  const recentTrades = marketConditions.recentTrades || [];
  
  const requiredRR = calculateDynamicRR(symbol, entryPrice, volatility, timeOfDay, recentTrades);
  
  // === CONFIDENCE-BASED ADJUSTMENTS ===
  let adjustedRequiredRR = requiredRR;
  
  if (confidence >= 0.8) {
    adjustedRequiredRR *= 0.9;   // Lower RR requirement for high confidence
  } else if (confidence <= 0.6) {
    adjustedRequiredRR *= 1.15;  // Higher RR requirement for low confidence
  }
  
  // === 5-MINUTE SPECIFIC FILTERS ===
  
  // Reject trades with extremely tight stops (less than 0.5% for 5m)
  const stopPercentage = riskAmount / entryPrice;
  if (stopPercentage < 0.005) {
    console.log(`RR rejected: Stop too tight (${(stopPercentage * 100).toFixed(2)}%)`);
    return false;
  }
  
  // Reject trades with extremely wide stops (more than 4% for 5m)
  if (stopPercentage > 0.04) {
    console.log(`RR rejected: Stop too wide (${(stopPercentage * 100).toFixed(2)}%)`);
    return false;
  }
  
  const passes = currentRR >= adjustedRequiredRR;
  
  console.log(`RR Check: ${currentRR.toFixed(2)} vs ${adjustedRequiredRR.toFixed(2)} (confidence: ${confidence.toFixed(2)}) - ${passes ? 'PASS' : 'FAIL'}`);
  
  return passes;
}

// === NEW 5-MINUTE SPECIFIC FUNCTIONS ===

export function pass5MinuteRR(
  entryPrice: number,
  stopPrice: number,
  targetPrice: number,
  confidence: number = 0.7
): boolean {
  const riskAmount = Math.abs(entryPrice - stopPrice);
  const rewardAmount = Math.abs(targetPrice - entryPrice);
  const currentRR = rewardAmount / riskAmount;
  
  // 5-minute specific thresholds
  let requiredRR = 1.4;  // Base requirement for 5m
  
  // Adjust based on confidence
  if (confidence >= 0.8) {
    requiredRR = 1.2;     // Lower requirement for high confidence
  } else if (confidence >= 0.7) {
    requiredRR = 1.4;     // Standard requirement
  } else {
    requiredRR = 1.6;     // Higher requirement for low confidence
  }
  
  return currentRR >= requiredRR;
}

export function calculate5MinuteSize(
  baseSize: number,
  confidence: number,
  volatility: number,
  timeOfDay: string = 'default'
): number {
  let sizeMultiplier = 1.0;
  
  // === CONFIDENCE MULTIPLIER (5m Optimized) ===
  if (confidence >= 0.85) {
    sizeMultiplier *= 1.3;    // Increase size for very high confidence
  } else if (confidence >= 0.75) {
    sizeMultiplier *= 1.15;   // Moderate increase for high confidence
  } else if (confidence < 0.65) {
    sizeMultiplier *= 0.8;    // Reduce size for low confidence
  }
  
  // === VOLATILITY MULTIPLIER (5m Specific) ===
  if (volatility > 0.025) {
    sizeMultiplier *= 0.8;    // Reduce size in high volatility
  } else if (volatility < 0.01) {
    sizeMultiplier *= 1.1;    // Increase size in low volatility
  }
  
  // === TIME-OF-DAY MULTIPLIER ===
  switch (timeOfDay) {
    case 'asian':
      sizeMultiplier *= 0.9;   // Smaller size during Asian session
      break;
    case 'ny':
      sizeMultiplier *= 1.1;   // Larger size during NY session
      break;
    case 'overlap':
      sizeMultiplier *= 1.05;  // Slightly larger during overlaps
      break;
  }
  
  // Ensure reasonable bounds
  sizeMultiplier = Math.max(0.6, Math.min(1.5, sizeMultiplier));
  
  return baseSize * sizeMultiplier;
}

// ========================================
// 🎯 STRATEGY-SPECIFIC RR CURVES
// ========================================

/**
 * Strategy-specific RR thresholds optimized for different trading styles
 */
export const STRATEGY_RR_CURVES = {
  MomentumScalp: {
    baseThresholds: [0.7, 0.8, 1.0, 1.2, 1.4], // More permissive for scalping
    winRateBreakpoints: [0.70, 0.60, 0.50, 0.40]
  },
  TrendFollowMA: {
    baseThresholds: [1.0, 1.2, 1.4, 1.6, 1.8], // Standard for trend following
    winRateBreakpoints: [0.70, 0.60, 0.50, 0.40]
  },
  RangeBounce: {
    baseThresholds: [1.1, 1.3, 1.5, 1.7, 1.9], // Slightly higher for range trading
    winRateBreakpoints: [0.70, 0.60, 0.50, 0.40]
  },
  SMCReversal: {
    baseThresholds: [1.2, 1.4, 1.6, 1.8, 2.0], // Highest for reversal trades
    winRateBreakpoints: [0.70, 0.60, 0.50, 0.40]
  },
  default: {
    baseThresholds: [0.9, 1.1, 1.3, 1.5, 1.7], // Fallback
    winRateBreakpoints: [0.70, 0.60, 0.50, 0.40]
  }
} as const;

/**
 * Get strategy-specific RR threshold based on win probability
 * @param strategyName Name of the strategy
 * @param winProb Win probability from recent trades (0-1)
 * @returns Base RR threshold for the strategy
 */
export function getStrategyRRThreshold(strategyName: string, winProb: number): number {
  const curve = STRATEGY_RR_CURVES[strategyName as keyof typeof STRATEGY_RR_CURVES] || STRATEGY_RR_CURVES.default;
  const { baseThresholds, winRateBreakpoints } = curve;
  
  // Find appropriate threshold based on win rate
  for (let i = 0; i < winRateBreakpoints.length; i++) {
    if (winProb > winRateBreakpoints[i]) {
      return baseThresholds[i];
    }
  }
  
  // Return strictest threshold for very low win rates
  return baseThresholds[baseThresholds.length - 1];
}

// ========================================
// 🎯 MARKET REGIME DETECTION
// ========================================

/**
 * Market regime types
 */
export type MarketRegime = 'trending' | 'ranging' | 'volatile' | 'quiet';

/**
 * Market regime analysis result
 */
export interface MarketRegimeAnalysis {
  regime: MarketRegime;
  confidence: number;
  trendStrength: number;
  volatility: number;
  momentum: number;
  rangeStrength: number;
}

/**
 * Detect market regime based on multiple indicators
 * @param adx Average Directional Index (trend strength)
 * @param atr Average True Range (volatility)
 * @param rsi Relative Strength Index (momentum)
 * @param bbWidth Bollinger Band Width (volatility)
 * @param recentTrend Recent trend strength
 * @returns Market regime analysis
 */
export function detectMarketRegime(
  adx: number,
  atr: number,
  rsi: number,
  bbWidth: number,
  recentTrend: number
): MarketRegimeAnalysis {
  // Normalize inputs (0-1 scale)
  const trendStrength = Math.min(adx / 50, 1); // ADX 0-50+ -> 0-1
  const volatility = Math.min(atr * 100, 1); // ATR as percentage
  const momentum = Math.abs(rsi - 50) / 50; // RSI deviation from 50
  const rangeStrength = Math.min(bbWidth * 10, 1); // BB width normalized
  const trendMomentum = Math.min(Math.abs(recentTrend) * 50, 1);
  
  // Regime detection logic
  let regime: MarketRegime;
  let confidence: number;
  
  if (trendStrength > 0.6 && trendMomentum > 0.4) {
    // Strong trend with momentum
    regime = 'trending';
    confidence = (trendStrength + trendMomentum) / 2;
  } else if (volatility > 0.7 || rangeStrength > 0.8) {
    // High volatility or wide ranges
    regime = 'volatile';
    confidence = Math.max(volatility, rangeStrength);
  } else if (trendStrength < 0.3 && volatility < 0.3 && momentum < 0.3) {
    // Low activity across all metrics
    regime = 'quiet';
    confidence = 1 - Math.max(trendStrength, volatility, momentum);
  } else {
    // Default to ranging market
    regime = 'ranging';
    confidence = 1 - trendStrength; // Higher confidence when trend is weaker
  }
  
  return {
    regime,
    confidence: Math.min(confidence, 1),
    trendStrength,
    volatility,
    momentum,
    rangeStrength
  };
}

/**
 * Get regime-adjusted RR multiplier
 * @param regime Market regime
 * @param strategyName Strategy name
 * @returns RR multiplier (0.7-1.3)
 */
export function getRegimeRRMultiplier(regime: MarketRegime, strategyName: string): number {
  const multipliers = {
    trending: {
      MomentumScalp: 0.9,     // Easier in trends
      TrendFollowMA: 0.8,     // Best in trends
      RangeBounce: 1.2,       // Harder in trends
      SMCReversal: 1.1,       // Slightly harder
      default: 0.9
    },
    ranging: {
      MomentumScalp: 1.0,     // Neutral
      TrendFollowMA: 1.3,     // Much harder in ranges
      RangeBounce: 0.8,       // Best in ranges
      SMCReversal: 0.9,       // Good for reversals
      default: 1.0
    },
    volatile: {
      MomentumScalp: 1.1,     // Harder with high volatility
      TrendFollowMA: 1.0,     // Can handle volatility
      RangeBounce: 1.2,       // Harder with false breakouts
      SMCReversal: 0.9,       // Good for volatile reversals
      default: 1.1
    },
    quiet: {
      MomentumScalp: 1.3,     // Much harder in quiet markets
      TrendFollowMA: 1.2,     // Harder without momentum
      RangeBounce: 1.1,       // Slightly harder
      SMCReversal: 1.2,       // Harder without clear signals
      default: 1.2
    }
  };
  
  return multipliers[regime][strategyName as keyof typeof multipliers[typeof regime]] || 
         multipliers[regime].default;
}

// ========================================
// 🎯 DYNAMIC POSITION SIZING
// ========================================

/**
 * Dynamic position sizing based on market conditions and strategy confidence
 * @param baseSize Base position size
 * @param strategyName Strategy name
 * @param regime Market regime
 * @param regimeConfidence Confidence in regime detection (0-1)
 * @param winProb Historical win probability (0-1)
 * @param rrRatio Risk-reward ratio of the trade
 * @param volatility Market volatility (0-1)
 * @returns Adjusted position size multiplier (0.3-2.0)
 */
export function getDynamicPositionSize(
  baseSize: number,
  strategyName: string,
  regime: MarketRegime,
  regimeConfidence: number,
  winProb: number,
  rrRatio: number,
  volatility: number
): number {
  // Strategy confidence in different regimes
  const strategyConfidence = {
    trending: {
      MomentumScalp: 0.8,
      TrendFollowMA: 0.95,
      RangeBounce: 0.4,
      SMCReversal: 0.6,
      default: 0.7
    },
    ranging: {
      MomentumScalp: 0.7,
      TrendFollowMA: 0.3,
      RangeBounce: 0.95,
      SMCReversal: 0.8,
      default: 0.7
    },
    volatile: {
      MomentumScalp: 0.6,
      TrendFollowMA: 0.7,
      RangeBounce: 0.5,
      SMCReversal: 0.8,
      default: 0.6
    },
    quiet: {
      MomentumScalp: 0.3,
      TrendFollowMA: 0.4,
      RangeBounce: 0.6,
      SMCReversal: 0.5,
      default: 0.4
    }
  };
  
  const stratConf = strategyConfidence[regime][strategyName as keyof typeof strategyConfidence[typeof regime]] || 
                   strategyConfidence[regime].default;
  
  // Base multiplier from strategy confidence in current regime
  let sizeMultiplier = 0.5 + (stratConf * 0.8); // 0.5-1.3 range
  
  // Regime confidence adjustment
  sizeMultiplier *= (0.8 + (regimeConfidence * 0.4)); // 0.8-1.2 multiplier
  
  // Win probability adjustment
  if (winProb > 0.7) {
    sizeMultiplier *= 1.2; // Increase size for high win rate
  } else if (winProb < 0.4) {
    sizeMultiplier *= 0.7; // Decrease size for low win rate
  }
  
  // Risk-reward adjustment
  if (rrRatio > 2.0) {
    sizeMultiplier *= 1.1; // Slightly larger for great RR
  } else if (rrRatio < 1.0) {
    sizeMultiplier *= 0.8; // Smaller for poor RR
  }
  
  // Volatility adjustment (reduce size in high volatility)
  if (volatility > 0.01) {
    sizeMultiplier *= 0.7; // High volatility
  } else if (volatility < 0.003) {
    sizeMultiplier *= 1.1; // Low volatility
  }
  
  // Ensure size stays within reasonable bounds
  sizeMultiplier = Math.max(0.3, Math.min(2.0, sizeMultiplier));
  
  return baseSize * sizeMultiplier;
}

// ========================================
// 🎯 ADAPTIVE STOP-LOSS MANAGEMENT
// ========================================

/**
 * Stop-loss adjustment strategies
 */
export type StopLossType = 'fixed' | 'trailing' | 'volatility_based' | 'support_resistance';

/**
 * Adaptive stop-loss configuration
 */
export interface AdaptiveStopLoss {
  type: StopLossType;
  baseDistance: number;
  adjustmentFactor: number;
  maxDistance: number;
  minDistance: number;
  trailingPercent?: number;
}

/**
 * Get adaptive stop-loss configuration based on strategy and market conditions
 * @param strategyName Strategy name
 * @param regime Market regime
 * @param volatility Market volatility (0-1)
 * @param atr Average True Range
 * @param price Current price
 * @returns Adaptive stop-loss configuration
 */
export function getAdaptiveStopLoss(
  strategyName: string,
  regime: MarketRegime,
  volatility: number,
  atr: number,
  price: number
): AdaptiveStopLoss {
  // Base configurations by strategy
  const baseConfigs = {
    MomentumScalp: {
      type: 'fixed' as StopLossType,
      baseDistance: atr * 0.8, // Tight stops for scalping
      adjustmentFactor: 1.0,
      maxDistance: atr * 1.5,
      minDistance: atr * 0.5
    },
    TrendFollowMA: {
      type: 'trailing' as StopLossType,
      baseDistance: atr * 1.5, // Wider stops for trends
      adjustmentFactor: 1.2,
      maxDistance: atr * 3.0,
      minDistance: atr * 1.0,
      trailingPercent: 0.5
    },
    RangeBounce: {
      type: 'support_resistance' as StopLossType,
      baseDistance: atr * 1.0, // Moderate stops for ranges
      adjustmentFactor: 1.0,
      maxDistance: atr * 2.0,
      minDistance: atr * 0.7
    },
    SMCReversal: {
      type: 'volatility_based' as StopLossType,
      baseDistance: atr * 1.2, // Adaptive stops for reversals
      adjustmentFactor: 1.1,
      maxDistance: atr * 2.5,
      minDistance: atr * 0.8
    }
  };
  
  const config = baseConfigs[strategyName as keyof typeof baseConfigs] || baseConfigs.MomentumScalp;
  
  // Regime-based adjustments
  const regimeMultipliers = {
    trending: {
      MomentumScalp: 0.9,     // Tighter stops in trends
      TrendFollowMA: 1.2,     // Wider stops to ride trends
      RangeBounce: 0.8,       // Much tighter in trending markets
      SMCReversal: 1.0,       // Standard
      default: 1.0
    },
    ranging: {
      MomentumScalp: 1.0,     // Standard
      TrendFollowMA: 0.8,     // Tighter stops in ranges
      RangeBounce: 1.1,       // Slightly wider for range bounces
      SMCReversal: 1.0,       // Standard
      default: 1.0
    },
    volatile: {
      MomentumScalp: 1.3,     // Much wider in volatile markets
      TrendFollowMA: 1.2,     // Wider stops
      RangeBounce: 1.4,       // Much wider for false breakouts
      SMCReversal: 1.1,       // Slightly wider
      default: 1.2
    },
    quiet: {
      MomentumScalp: 0.7,     // Tighter stops in quiet markets
      TrendFollowMA: 0.8,     // Tighter stops
      RangeBounce: 0.9,       // Slightly tighter
      SMCReversal: 0.8,       // Tighter stops
      default: 0.8
    }
  };
  
  const regimeMultiplier = regimeMultipliers[regime][strategyName as keyof typeof regimeMultipliers[typeof regime]] || 
                          regimeMultipliers[regime].default;
  
  // Volatility adjustment
  const volatilityMultiplier = volatility > 0.01 ? 1.3 : (volatility < 0.003 ? 0.8 : 1.0);
  
  // Calculate adjusted distances
  const totalMultiplier = regimeMultiplier * volatilityMultiplier;
  const adjustedBaseDistance = config.baseDistance * totalMultiplier;
  const adjustedMaxDistance = config.maxDistance * totalMultiplier;
  const adjustedMinDistance = config.minDistance * totalMultiplier;
  
  return {
    ...config,
    baseDistance: Math.max(adjustedMinDistance, Math.min(adjustedMaxDistance, adjustedBaseDistance)),
    maxDistance: adjustedMaxDistance,
    minDistance: adjustedMinDistance,
    adjustmentFactor: config.adjustmentFactor * totalMultiplier
  };
}

// ========================================
// 🎯 ENHANCED EXIT MANAGEMENT
// ========================================

/**
 * Exit strategy configuration
 */
export interface ExitStrategy {
  partialExits: boolean;
  trailingStop: boolean;
  dynamicTargets: boolean;
  partialExitLevels: number[];
  partialExitSizes: number[];
  trailingStopDistance: number;
  targetExtensionMultiplier: number;
}

/**
 * Get enhanced exit strategy based on market conditions and strategy
 * @param strategyName Strategy name
 * @param regime Market regime
 * @param volatility Market volatility
 * @param rrRatio Current risk-reward ratio
 * @param winProb Historical win probability
 * @returns Exit strategy configuration
 */
export function getEnhancedExitStrategy(
  strategyName: string,
  regime: MarketRegime,
  volatility: number,
  rrRatio: number,
  winProb: number
): ExitStrategy {
  // Base exit strategies by strategy type
  const baseStrategies = {
    MomentumScalp: {
      partialExits: true,
      trailingStop: false,
      dynamicTargets: false,
      partialExitLevels: [0.5, 1.0], // Take profits at 0.5R and 1.0R
      partialExitSizes: [0.5, 0.5],  // 50% at each level
      trailingStopDistance: 0.3,
      targetExtensionMultiplier: 1.0
    },
    TrendFollowMA: {
      partialExits: true,
      trailingStop: true,
      dynamicTargets: true,
      partialExitLevels: [1.0, 2.0, 3.0], // Ride trends longer
      partialExitSizes: [0.3, 0.3, 0.4],  // Conservative exits
      trailingStopDistance: 0.5,
      targetExtensionMultiplier: 1.5
    },
    RangeBounce: {
      partialExits: true,
      trailingStop: false,
      dynamicTargets: false,
      partialExitLevels: [0.8, 1.5], // Quick exits in ranges
      partialExitSizes: [0.6, 0.4],  // Most profit early
      trailingStopDistance: 0.2,
      targetExtensionMultiplier: 1.0
    },
    SMCReversal: {
      partialExits: true,
      trailingStop: true,
      dynamicTargets: true,
      partialExitLevels: [1.0, 2.0], // Conservative reversal exits
      partialExitSizes: [0.5, 0.5],  // Balanced
      trailingStopDistance: 0.4,
      targetExtensionMultiplier: 1.2
    }
  };
  
  const baseStrategy = baseStrategies[strategyName as keyof typeof baseStrategies] || baseStrategies.MomentumScalp;
  
  // Regime adjustments
  const regimeAdjustments = {
    trending: {
      targetExtensionMultiplier: 1.3, // Extend targets in trends
      trailingStopDistance: 0.6,      // Wider trailing stops
      partialExitAdjustment: 0.8      // Take less profit early
    },
    ranging: {
      targetExtensionMultiplier: 0.8, // Shorter targets in ranges
      trailingStopDistance: 0.3,      // Tighter trailing stops
      partialExitAdjustment: 1.2      // Take more profit early
    },
    volatile: {
      targetExtensionMultiplier: 0.9, // Slightly shorter targets
      trailingStopDistance: 0.5,      // Moderate trailing stops
      partialExitAdjustment: 1.1      // Take slightly more profit early
    },
    quiet: {
      targetExtensionMultiplier: 1.1, // Slightly longer targets
      trailingStopDistance: 0.4,      // Moderate trailing stops
      partialExitAdjustment: 0.9      // Take slightly less profit early
    }
  };
  
  const adjustment = regimeAdjustments[regime];
  
  // Win rate adjustments
  const winRateMultiplier = winProb > 0.6 ? 1.1 : (winProb < 0.4 ? 0.9 : 1.0);
  
  // Volatility adjustments
  const volatilityMultiplier = volatility > 0.01 ? 0.9 : (volatility < 0.003 ? 1.1 : 1.0);
  
  // Apply adjustments
  const adjustedPartialExitSizes = baseStrategy.partialExitSizes.map(size => 
    Math.min(1.0, size * adjustment.partialExitAdjustment)
  );
  
  // Normalize partial exit sizes to sum to 1.0
  const totalSize = adjustedPartialExitSizes.reduce((sum, size) => sum + size, 0);
  const normalizedSizes = adjustedPartialExitSizes.map(size => size / totalSize);
  
  return {
    ...baseStrategy,
    partialExitSizes: normalizedSizes,
    trailingStopDistance: baseStrategy.trailingStopDistance * adjustment.trailingStopDistance,
    targetExtensionMultiplier: baseStrategy.targetExtensionMultiplier * 
                              adjustment.targetExtensionMultiplier * 
                              winRateMultiplier * 
                              volatilityMultiplier
  };
}

// ========================================
// 🎯 TIME-BASED OPTIMIZATIONS
// ========================================

/**
 * Trading session information
 */
export interface TradingSession {
  name: string;
  startHour: number;
  endHour: number;
  volatilityMultiplier: number;
  rrMultiplier: number;
  maxTradesPerHour: number;
  preferredStrategies: string[];
}

/**
 * Get current trading session and optimizations
 * @param currentHour UTC hour (0-23)
 * @returns Trading session configuration
 */
export function getCurrentTradingSession(currentHour: number): TradingSession {
  const sessions: TradingSession[] = [
    {
      name: 'Asian',
      startHour: 0,
      endHour: 8,
      volatilityMultiplier: 0.8,
      rrMultiplier: 1.1,
      maxTradesPerHour: 6,
      preferredStrategies: ['RangeBounce', 'SMCReversal']
    },
    {
      name: 'London',
      startHour: 8,
      endHour: 16,
      volatilityMultiplier: 1.2,
      rrMultiplier: 0.9,
      maxTradesPerHour: 12,
      preferredStrategies: ['TrendFollowMA', 'MomentumScalp']
    },
    {
      name: 'NewYork',
      startHour: 13,
      endHour: 21,
      volatilityMultiplier: 1.3,
      rrMultiplier: 0.8,
      maxTradesPerHour: 15,
      preferredStrategies: ['MomentumScalp', 'TrendFollowMA']
    },
    {
      name: 'Overlap',
      startHour: 13,
      endHour: 16,
      volatilityMultiplier: 1.5,
      rrMultiplier: 0.7,
      maxTradesPerHour: 20,
      preferredStrategies: ['MomentumScalp', 'TrendFollowMA', 'SMCReversal']
    }
  ];
  
  // Find the most specific session (overlap takes priority)
  const activeSessions = sessions.filter(session => 
    currentHour >= session.startHour && currentHour < session.endHour
  );
  
  // Prefer overlap session if active
  const overlapSession = activeSessions.find(s => s.name === 'Overlap');
  if (overlapSession) return overlapSession;
  
  // Otherwise return the first active session
  return activeSessions[0] || sessions[0]; // Default to Asian if none found
}

/**
 * Get time-based strategy priority multiplier
 * @param strategyName Strategy name
 * @param currentHour UTC hour (0-23)
 * @returns Priority multiplier (0.5-2.0)
 */
export function getTimeBasedStrategyPriority(strategyName: string, currentHour: number): number {
  const session = getCurrentTradingSession(currentHour);
  
  // Check if strategy is preferred for this session
  if (session.preferredStrategies.includes(strategyName)) {
    return 1.3; // 30% boost for preferred strategies
  }
  
  // Time-specific adjustments
  const timeAdjustments = {
    MomentumScalp: {
      peak: [14, 15, 16, 20], // NY session peak hours
      good: [13, 17, 18, 19],
      poor: [0, 1, 2, 3, 4, 5, 6, 7, 22, 23]
    },
    TrendFollowMA: {
      peak: [8, 9, 13, 14, 15], // London open and NY overlap
      good: [10, 11, 12, 16, 17],
      poor: [0, 1, 2, 3, 4, 5, 6, 7, 21, 22, 23]
    },
    RangeBounce: {
      peak: [0, 1, 2, 3, 4, 5, 6, 7], // Asian session
      good: [21, 22, 23],
      poor: [13, 14, 15, 16] // NY overlap
    },
    SMCReversal: {
      peak: [8, 9, 21, 22], // Session opens/closes
      good: [0, 1, 7, 17, 18, 20],
      poor: [14, 15, 16] // High volatility overlap
    }
  };
  
  const adjustment = timeAdjustments[strategyName as keyof typeof timeAdjustments];
  if (!adjustment) return 1.0;
  
  if (adjustment.peak.includes(currentHour)) return 1.5;
  if (adjustment.good.includes(currentHour)) return 1.1;
  if (adjustment.poor.includes(currentHour)) return 0.7;
  
  return 1.0; // Neutral
}