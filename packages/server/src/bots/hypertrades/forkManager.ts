import { prisma } from '../../db';
import IoRedisMock from 'ioredis-mock';
import { forkCfg } from './config';

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
  rsiOB?: number;
  fastMAPeriod?: number;
  slowMAPeriod?: number;
  riskPct?: number;
}

interface Bot {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
  equity: number;
  pnlToday: number;
  parentId?: number | null;
}

/**
 * Check if a Prisma model is available
 * @param modelName The name of the model to check
 * @returns boolean indicating if the model exists
 */
function hasModel(modelName: string): boolean {
  return !!(prisma && modelName in prisma);
}

export async function weeklyFork() {
  try {
    // Check if required models exist
    if (!hasModel('bot') || !hasModel('hyperSettings')) {
      console.log('[weeklyFork] Required Prisma models not available (bot, hyperSettings)');
      return;
    }
    
    // Ensure we're using the correct Prisma client access pattern
    // @ts-ignore - New schema fields not yet recognized by TypeScript
    const parent = await prisma.bot.findFirst({ 
      where: { name: 'hypertrades', enabled: true } 
    });
    
    if (!parent) {
      console.log('[weeklyFork] No parent bot found');
      return;
    }

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
    
    // Define numeric keys to mutate
    const numericKeys = ['smcThresh', 'rsiOS', 'rsiOB', 'fastMAPeriod', 'slowMAPeriod', 'riskPct'];
    
    // @ts-ignore - New schema fields not yet recognized by TypeScript
    await prisma.hyperSettings.create({
      data: {
        id: child.id, // use botId as settings id
        smcThresh: mutate(set.smcThresh, forkCfg.mutatePct),
        rsiOS: mutate(set.rsiOS, forkCfg.mutatePct),
        rsiOB: mutate(set.rsiOB || 65, forkCfg.mutatePct),
        fastMAPeriod: Math.round(mutate(set.fastMAPeriod || 50, forkCfg.mutatePct)),
        slowMAPeriod: Math.round(mutate(set.slowMAPeriod || 200, forkCfg.mutatePct)),
        riskPct: mutate(set.riskPct || 1, forkCfg.mutatePct)
      }
    });
    
    console.log(`[fork] spawned ${child.name}`);
  } catch (error) {
    console.error('[weeklyFork] Error:', error);
  }
}

export async function weeklyEvaluate() {
  try {
    // Check if required models exist
    if (!hasModel('bot') || !hasModel('metric') || !hasModel('hyperSettings')) {
      console.log('[weeklyEvaluate] Required Prisma models not available (bot, metric, hyperSettings)');
      return;
    }
    
    // @ts-ignore - New schema fields not yet recognized by TypeScript
    const children = await prisma.bot.findMany({ 
      where: { parentId: { not: null }, enabled: true } 
    }) as Bot[];
    
    if (!children || children.length === 0) {
      console.log("[weeklyEvaluate] No child bots found to evaluate");
      return;
    }
    
    for (const c of children) {
      try {
        // @ts-ignore - New schema fields not yet recognized by TypeScript
        const metrics = await prisma.metric.findMany({ 
          where: { botId: c.id } 
        }) as Metric[];
        
        if (!metrics || metrics.length < 50) {
          console.log(`[weeklyEvaluate] Bot ${c.id} has insufficient metrics (${metrics?.length ?? 0}), skipping`);
          continue; // skip short runs
        }
        
        const rets = metrics.map((m: Metric) => m.pnl);
        const avg = rets.reduce((a: number, b: number) => a + b, 0) / rets.length;
        const sd = Math.sqrt(rets.map((r: number) => Math.pow(r - avg, 2))
                  .reduce((a: number, b: number) => a + b, 0) / rets.length) || 1e-6;
        const sharpe = avg / sd;
        
        if (!c.parentId) {
          console.log(`[weeklyEvaluate] Bot ${c.id} has no parent ID, skipping`);
          continue;
        }
        
        // parent stats
        // @ts-ignore - New schema fields not yet recognized by TypeScript
        const pMetrics = await prisma.metric.findMany({ 
          where: { botId: c.parentId } 
        }) as Metric[];
        
        if (!pMetrics || pMetrics.length === 0) {
          console.log(`[weeklyEvaluate] No parent metrics found for bot ${c.id}, skipping`);
          continue;
        }
        
        const pAvg = pMetrics.map((m: Metric) => m.pnl).reduce((a: number, b: number) => a + b, 0) / pMetrics.length || 0;
        const pSd = Math.sqrt(pMetrics.map((r: Metric) => Math.pow(r.pnl - pAvg, 2))
                 .reduce((a: number, b: number) => a + b, 0) / (pMetrics.length || 1)) || 1e-6;
        const pSharpe = pAvg / pSd;

        if (sharpe > pSharpe) {
          // @ts-ignore - New schema fields not yet recognized by TypeScript
          await prisma.bot.update({ 
            where: { id: c.parentId }, 
            data: { enabled: false } 
          });
          
          // @ts-ignore - New schema fields not yet recognized by TypeScript
          await prisma.bot.update({ 
            where: { id: c.id }, 
            data: { name: 'hypertrades', parentId: null } 
          });
          
          // @ts-ignore - New schema fields not yet recognized by TypeScript
          const childSettings = await prisma.hyperSettings.findUnique({ 
            where: { id: c.id } 
          }) as HyperSettings | null;
          
          if (childSettings) {
            // @ts-ignore - New schema fields not yet recognized by TypeScript
            await prisma.hyperSettings.update({ 
              where: { id: 1 }, 
              data: {
                smcThresh: childSettings.smcThresh,
                rsiOS: childSettings.rsiOS,
                rsiOB: childSettings.rsiOB,
                fastMAPeriod: childSettings.fastMAPeriod,
                slowMAPeriod: childSettings.slowMAPeriod,
                riskPct: childSettings.riskPct
              }
            });
          }
          
          console.log(`[fork] promoted ${c.id} with Sharpe ${sharpe.toFixed(2)} vs ${pSharpe.toFixed(2)}`);
          
          // Publish promotion event
          redis.publish('chan:metrics', JSON.stringify({ promotion: true, bot: c.id }));
        } else {
          console.log(`[fork] ${c.id} Sharpe ${sharpe.toFixed(2)} worse than parent`);
        }
      } catch (innerError) {
        console.error(`[weeklyEvaluate] Error processing bot ${c.id}:`, innerError);
      }
    }
  } catch (error) {
    console.error('[weeklyEvaluate] Error:', error);
  }
} 