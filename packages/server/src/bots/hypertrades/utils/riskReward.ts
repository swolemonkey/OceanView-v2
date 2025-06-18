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
  
  // Base threshold from win rate (optimized for 5m timeframes)
  let baseThreshold: number;
  if (winProb > 0.70) {
    baseThreshold = 0.8;  // Very high win rate = very permissive (was 1.0)
  } else if (winProb > 0.60) {
    baseThreshold = 1.0;  // High win rate = permissive (was 1.2)
  } else if (winProb > 0.50) {
    baseThreshold = 1.2;  // Medium win rate = moderate (was 1.4)
  } else if (winProb > 0.40) {
    baseThreshold = 1.4;  // Low win rate = stricter (was 1.6)
  } else {
    baseThreshold = 1.6;  // Very low win rate = strict (was 1.8)
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
 * @returns Promise<{passed: boolean, rr: number, threshold: number, winProb: number, adjustments: object}>
 */
export async function passRRDynamic(
  side: 'buy' | 'sell', 
  entry: number, 
  stop: number, 
  target: number, 
  symbol: string,
  volatility: number = 0.005,
  trendStrength: number = 0.005
): Promise<{
  passed: boolean, 
  rr: number, 
  threshold: number, 
  winProb: number,
  adjustments: {
    volatilityAdjustment: number,
    trendAdjustment: number,
    timeAdjustment: number,
    baseThreshold: number
  }
}> {
  const rr = Math.abs((target - entry) / (entry - stop));
      const winProb = await getWinProb(symbol, 40); // More trade history for 5m analysis
  
      // Calculate threshold with detailed breakdown for 5m trading
  let baseThreshold: number;
  if (winProb > 0.70) {
    baseThreshold = 0.8;
  } else if (winProb > 0.60) {
    baseThreshold = 1.0;
  } else if (winProb > 0.50) {
    baseThreshold = 1.2;
  } else if (winProb > 0.40) {
    baseThreshold = 1.4;
  } else {
    baseThreshold = 1.6;
  }
  
  const volatilityAdjustment = volatility > 0.008 ? -0.25 : (volatility < 0.003 ? 0.15 : 0);
  const trendAdjustment = trendStrength > 0.008 ? -0.2 : (trendStrength < 0.002 ? 0.15 : 0);
  
      // Time-of-day adjustment for 5m trading
  const hour = new Date().getUTCHours();
  const timeAdjustment = (hour >= 13 && hour <= 17) ? -0.1 : 0; // NY session
  
  const threshold = Math.max(0.7, Math.min(2.0, baseThreshold + volatilityAdjustment + trendAdjustment + timeAdjustment));
  
  return {
    passed: rr >= threshold,
    rr,
    threshold,
    winProb,
    adjustments: {
      volatilityAdjustment,
      trendAdjustment,
      timeAdjustment,
      baseThreshold
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