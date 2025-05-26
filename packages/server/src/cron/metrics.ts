import { prisma } from '../db.js';
import { addDays, startOfDay } from 'date-fns';

interface TradeData {
  pnl: number;
  strategyVersionId: number;
  botName: string;
  ts: Date;
}

export async function computeYesterdayMetrics() {
  const today = startOfDay(new Date());
  const yesterday = addDays(today, -1);
  
  // Fetch trades from the previous day
  const trades = await prisma.strategyTrade.findMany({
    where: { ts: { gte: yesterday, lt: today } }
  });
  
  if (!trades.length) return;
  
  const gross = trades.reduce((s, t) => s + t.pnl, 0);
  const wins  = trades.filter(t => t.pnl > 0).length;
  const stdev = Math.sqrt(trades.reduce((s, t) => s + ((t.pnl - gross/trades.length) ** 2), 0) / trades.length);
  const sharpe = stdev ? (gross/trades.length)/stdev : 0;
  const maxDD = trades.reduce((dd, t) => Math.min(dd, t.pnl), 0);
  const strat = trades[0].strategyVersionId;
  const bot = trades[0].botName;
  
  // Save daily metrics
  await prisma.dailyMetric.upsert({
    where: { date: yesterday },
    update: { 
      grossPnl: gross, 
      netPnl: gross, 
      winRate: wins/trades.length,
      sharpe, 
      maxDrawdown: maxDD, 
      trades: trades.length 
    },
    create: { 
      date: yesterday, 
      strategyVersionId: strat, 
      botName: bot,
      trades: trades.length, 
      grossPnl: gross, 
      netPnl: gross,
      winRate: wins/trades.length, 
      sharpe, 
      maxDrawdown: maxDD 
    }
  });
} 