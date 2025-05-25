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
  
  // Use type assertion for the Prisma client
  const trades = await (prisma as any).strategyTrade.findMany({
    where: { ts: { gte: yesterday, lt: today } }
  }) as TradeData[];
  
  if (!trades.length) return;
  
  const gross = trades.reduce((s: number, t: TradeData) => s + t.pnl, 0);
  const wins  = trades.filter((t: TradeData) => t.pnl > 0).length;
  const stdev = Math.sqrt(trades.reduce((s: number, t: TradeData) => s + ((t.pnl - gross/trades.length) ** 2), 0) / trades.length);
  const sharpe = stdev ? (gross/trades.length)/stdev : 0;
  const maxDD = trades.reduce((dd: number, t: TradeData) => Math.min(dd, t.pnl), 0);
  const strat = trades[0].strategyVersionId;
  const bot = trades[0].botName;
  
  // Use type assertion for the Prisma client
  await (prisma as any).dailyMetric.upsert({
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