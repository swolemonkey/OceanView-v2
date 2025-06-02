import { prisma } from '@/db.js';
import { addDays, startOfDay } from 'date-fns';

/**
 * Computes portfolio-wide metrics for the previous day
 * Aggregates metrics across all symbols and writes to PortfolioMetric table
 */
export async function computePortfolioMetrics() {
  const today = startOfDay(new Date());
  const yesterday = addDays(today, -1);
  
  try {
    console.log(`[${new Date().toISOString()}] Computing portfolio metrics for ${yesterday.toISOString()}`);
    
    // Get all trades from the previous day
    const trades = await prisma.strategyTrade.findMany({
      where: { 
        ts: { 
          gte: yesterday, 
          lt: today 
        } 
      }
    });
    
    if (!trades.length) {
      console.log(`[${new Date().toISOString()}] No trades found for ${yesterday.toISOString()}, skipping portfolio metrics`);
      return;
    }
    
    // Calculate portfolio metrics
    const dailyPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
    
    // Get metrics from each bot to calculate equity and max open risk
    const bots = await prisma.bot.findMany({ where: { enabled: true } });
    const equityStart = bots.reduce((sum, bot) => sum + bot.equity - bot.pnlToday, 0);
    const equityEnd = bots.reduce((sum, bot) => sum + bot.equity, 0);
    
    // Calculate max drawdown from trade data
    let runningPnl = 0;
    let maxDrawdown = 0;
    
    // Sort trades by timestamp
    const sortedTrades = [...trades].sort((a, b) => a.ts.getTime() - b.ts.getTime());
    
    for (const trade of sortedTrades) {
      runningPnl += trade.pnl;
      maxDrawdown = Math.min(maxDrawdown, runningPnl);
    }
    
    // Calculate max open risk (approximation based on trade data)
    // In a real system, you'd want to track the actual max risk during the day
    const maxOpenRisk = Math.abs(maxDrawdown) / equityStart * 100;
    
    // Store the portfolio metrics
    await prisma.portfolioMetric.upsert({
      where: { 
        date: yesterday
      },
      update: {
        equityStart,
        equityEnd,
        dailyPnl,
        maxOpenRisk,
        maxDrawdown: Math.abs(maxDrawdown)
      },
      create: {
        date: yesterday,
        equityStart,
        equityEnd,
        dailyPnl,
        maxOpenRisk,
        maxDrawdown: Math.abs(maxDrawdown)
      }
    });
    
    console.log(`[${new Date().toISOString()}] Portfolio metrics computed and stored for ${yesterday.toISOString()}`);
    console.log(`  - Equity: $${equityStart.toFixed(2)} → $${equityEnd.toFixed(2)}`);
    console.log(`  - PnL: $${dailyPnl.toFixed(2)}`);
    console.log(`  - Max Risk: ${maxOpenRisk.toFixed(2)}%`);
    console.log(`  - Max Drawdown: $${Math.abs(maxDrawdown).toFixed(2)}`);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error computing portfolio metrics:`, error);
  }
} 