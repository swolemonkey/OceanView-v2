import { prisma } from '../../../db.js';

/**
 * Calculate rolling win probability from recent trades for the symbol
 * @param symbol The trading symbol to analyze
 * @param lookbackTrades Number of recent trades to analyze (default: 30)
 * @returns Promise<number> Win probability between 0 and 1
 */
export async function getWinProb(symbol: string, lookbackTrades: number = 10): Promise<number> {
  try {
    const recentTrades = await prisma.strategyTrade.findMany({
      where: { symbol },
      orderBy: { ts: 'desc' },
      take: lookbackTrades
    });

    if (recentTrades.length === 0) {
      return 0.5; // Default 50% if no trade history
    }

    const winningTrades = recentTrades.filter(trade => trade.pnl > 0).length;
    const winProb = winningTrades / recentTrades.length;
    
    return winProb;
  } catch (error) {
    console.error('Error calculating win probability:', error);
    return 0.5; // Default fallback
  }
}

/**
 * Calculate dynamic risk-reward threshold based on recent performance
 * @param winProb Win probability from recent trades (0-1)
 * @returns Dynamic risk-reward threshold
 */
export function getDynamicRRThreshold(winProb: number): number {
  // More permissive adaptive threshold logic:
  // High win rate (>60%) = lower threshold (1.2) - can afford smaller R/R
  // Low win rate (<40%) = higher threshold (1.8) - need bigger R/R but not too strict
  // Medium win rate = relaxed threshold (1.5) - more trading opportunities
  if (winProb > 0.6) {
    return 1.2;
  } else if (winProb < 0.4) {
    return 1.8;
  } else {
    return 1.5;
  }
}

/**
 * Enhanced risk-reward check with dynamic thresholds
 * @param side Trade side (buy/sell)
 * @param entry Entry price
 * @param stop Stop loss price
 * @param target Target price
 * @param symbol Trading symbol for win rate calculation
 * @returns Promise<{passed: boolean, rr: number, threshold: number, winProb: number}>
 */
export async function passRRDynamic(
  side: 'buy' | 'sell', 
  entry: number, 
  stop: number, 
  target: number, 
  symbol: string
): Promise<{passed: boolean, rr: number, threshold: number, winProb: number}> {
  const rr = Math.abs((target - entry) / (entry - stop));
  const winProb = await getWinProb(symbol);
  const threshold = getDynamicRRThreshold(winProb);
  
  return {
    passed: rr >= threshold,
    rr,
    threshold,
    winProb
  };
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use passRRDynamic for better performance-based thresholds
 */
export function passRR(side:'buy'|'sell', entry:number, stop:number, target:number, minRR=2){
  const rr=Math.abs((target-entry)/(entry-stop));
  return rr>=minRR;
} 