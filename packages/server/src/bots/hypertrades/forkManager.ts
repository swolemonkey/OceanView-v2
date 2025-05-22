import { prisma } from '../../db.js';
import IoRedisMock from 'ioredis-mock';

// Use Redis mock for development
// @ts-ignore - Working around type issues with ioredis-mock
const redis = new IoRedisMock();

function mutate(x: number, pct = 0.1) { 
  return x * (1 + (Math.random() * 2 - 1) * pct); 
}

interface Metric {
  botId: number;
  equity: number;
  pnl: number;
  date: Date;
}

interface HyperSettings {
  id: number;
  smcThresh: number;
  rsiOS: number;
}

export async function weeklyFork() {
  // @ts-ignore - New schema fields not yet recognized by TypeScript
  const parent = await prisma.bot.findFirst({ where: { name: 'hypertrades', enabled: true } });
  if (!parent) return;

  // read parent params
  // @ts-ignore - New schema fields not yet recognized by TypeScript
  const set = await prisma.hyperSettings.findUnique({ where: { id: 1 } }) as HyperSettings;
  
  // create child bot
  // @ts-ignore - New schema fields not yet recognized by TypeScript
  const child = await prisma.bot.create({ 
    data: {
      name: `hypertrades_fork_${Date.now()}`,
      type: 'hypertrades',
      enabled: true,
      parentId: parent.id
    }
  });
  
  // @ts-ignore - New schema fields not yet recognized by TypeScript
  await prisma.hyperSettings.create({
    data: {
      id: child.id, // use botId as settings id
      smcThresh: mutate(set.smcThresh, 0.1),
      rsiOS: mutate(set.rsiOS, 0.1)
    }
  });
  
  console.log(`[fork] spawned ${child.name}`);
}

export async function weeklyEvaluate() {
  // @ts-ignore - New schema fields not yet recognized by TypeScript
  const children = await prisma.bot.findMany({ where: { parentId: { not: null }, enabled: true } });
  
  for (const c of children) {
    // @ts-ignore - New schema fields not yet recognized by TypeScript
    const metrics = await prisma.metric.findMany({ where: { botId: c.id } }) as Metric[];
    if (metrics.length < 50) continue; // skip short runs
    
    const rets = metrics.map((m: Metric) => m.pnl);
    const avg = rets.reduce((a: number, b: number) => a + b, 0) / rets.length;
    const sd = Math.sqrt(rets.map((r: number) => Math.pow(r - avg, 2)).reduce((a: number, b: number) => a + b, 0) / rets.length) || 1e-6;
    const sharpe = avg / sd;
    
    // parent stats
    // @ts-ignore - New schema fields not yet recognized by TypeScript
    const pMetrics = await prisma.metric.findMany({ where: { botId: c.parentId! } }) as Metric[];
    const pAvg = pMetrics.map((m: Metric) => m.pnl).reduce((a: number, b: number) => a + b, 0) / pMetrics.length || 0;
    const pSd = Math.sqrt(pMetrics.map((r: Metric) => Math.pow(r.pnl - pAvg, 2)).reduce((a: number, b: number) => a + b, 0) / (pMetrics.length || 1)) || 1e-6;
    const pSharpe = pAvg / pSd;

    if (sharpe > pSharpe) {
      // @ts-ignore - New schema fields not yet recognized by TypeScript
      await prisma.bot.update({ where: { id: c.parentId! }, data: { enabled: false } });
      // @ts-ignore - New schema fields not yet recognized by TypeScript
      await prisma.bot.update({ where: { id: c.id }, data: { name: 'hypertrades', parentId: null } });
      // @ts-ignore - New schema fields not yet recognized by TypeScript
      await prisma.hyperSettings.update({ 
        where: { id: 1 }, 
        data: {
          // @ts-ignore - New schema fields not yet recognized by TypeScript
          smcThresh: (await prisma.hyperSettings.findUnique({ where: { id: c.id } }) as HyperSettings).smcThresh,
          // @ts-ignore - New schema fields not yet recognized by TypeScript
          rsiOS: (await prisma.hyperSettings.findUnique({ where: { id: c.id } }) as HyperSettings).rsiOS
        }
      });
      console.log(`[fork] promoted ${c.id} with Sharpe ${sharpe.toFixed(2)} vs ${pSharpe.toFixed(2)}`);
      
      // Publish promotion event
      redis.publish('chan:metrics', JSON.stringify({ promotion: true, bot: c.id }));
    } else {
      console.log(`[fork] ${c.id} Sharpe ${sharpe.toFixed(2)} worse than parent`);
    }
  }
} 