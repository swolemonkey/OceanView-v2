import { prisma } from '../db.js';
import { addDays, startOfDay } from 'date-fns';

interface TradeData {
  pnl: number;
  strategyVersionId: number;
  botName: string;
  ts: Date;
  symbol: string;
}

export async function computeYesterdayMetrics() {
  const today = startOfDay(new Date());
  const yesterday = addDays(today, -1);
  
  // Fetch trades from the previous day
  const trades = await prisma.strategyTrade.findMany({
    where: { ts: { gte: yesterday, lt: today } }
  });
  
  if (!trades.length) return;
  
  // Group trades by symbol AND strategyVersionId
  const groupedTrades = new Map<string, TradeData[]>();
  
  trades.forEach(trade => {
    const key = `${trade.symbol}:${trade.strategyVersionId}`;
    if (!groupedTrades.has(key)) {
      groupedTrades.set(key, []);
    }
    groupedTrades.get(key)!.push(trade);
  });
  
  // Process metrics for each group
  for (const [key, tradeBatch] of groupedTrades.entries()) {
    const [symbol, versionIdStr] = key.split(':');
    const versionId = parseInt(versionIdStr);
    
    const gross = tradeBatch.reduce((s, t) => s + t.pnl, 0);
    const wins = tradeBatch.filter(t => t.pnl > 0).length;
    const stdev = Math.sqrt(tradeBatch.reduce((s, t) => s + ((t.pnl - gross/tradeBatch.length) ** 2), 0) / tradeBatch.length);
    const sharpe = stdev ? (gross/tradeBatch.length)/stdev : 0;
    const maxDD = tradeBatch.reduce((dd, t) => Math.min(dd, t.pnl), 0);
    const bot = tradeBatch[0].botName;
    
    // Save daily metrics for this group
    await prisma.dailyMetric.upsert({
      where: { 
        date_symbol_strategyVersionId: {
          date: yesterday,
          symbol,
          strategyVersionId: versionId
        }
      },
      update: { 
        grossPnl: gross, 
        netPnl: gross, 
        winRate: wins/tradeBatch.length as number,
        sharpe, 
        maxDrawdown: maxDD, 
        trades: tradeBatch.length,
        botName: bot
      },
      create: { 
        date: yesterday, 
        symbol,
        strategyVersionId: versionId, 
        botName: bot,
        trades: tradeBatch.length, 
        grossPnl: gross, 
        netPnl: gross,
        winRate: wins/tradeBatch.length as number, 
        sharpe, 
        maxDrawdown: maxDD 
      }
    });
  }
} 