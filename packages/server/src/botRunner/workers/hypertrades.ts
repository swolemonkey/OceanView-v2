import { parentPort, workerData } from 'worker_threads';
import { Perception } from '../../bots/hypertrades/perception.js';
import { decide } from '../../bots/hypertrades/decision.js';
import { RiskManager } from '../../bots/hypertrades/risk.js';
import { executeIdea, logCompletedTrade } from '../../bots/hypertrades/execution.js';
import { loadConfig } from '../../bots/hypertrades/config.js';
import { prisma } from '../../db.js';

interface Config {
  smc: { thresh: number };
  ta: { rsiPeriod: number; overSold: number; overBought: number };
  riskPct: number;
  symbol: string;
}

const perception = new Perception();
const risk = new RiskManager(workerData.botId);
const log = (...a:any[]) => console.log(`[hypertrades]`, ...a);

// Initialize config
let cfg: Config;
let versionId: number;

async function init() {
  cfg = await loadConfig();
  
  // Get strategy version from worker data
  const { botId, stratVersion } = workerData as { botId: number; stratVersion: string };
  
  // Upsert the strategy version - use type assertion to work around TypeScript errors
  // for newly added Prisma models that TypeScript doesn't yet recognize
  const versionRow = await (prisma as any).strategyVersion.upsert({
    where: { hash: stratVersion },
    update: {},
    create: { hash: stratVersion, description: 'auto‑created' }
  });
  versionId = versionRow.id;
  log('Using strategy version:', stratVersion, 'ID:', versionId);
  
  // Report metrics every minute
  setInterval(() => {
    parentPort?.postMessage({ 
      type: 'metric', 
      equity: risk.equity, 
      pnl: risk.dayPnL 
    });
  }, 60000);
}

init().catch(err => console.error('[hypertrades] init error:', err));

parentPort?.on('message', async (m) => {
  if (m.type === 'tick') {
    const { prices, ts } = JSON.parse(m.data);
    const btc = prices.bitcoin?.usd;
    if (!btc) return;

    perception.addTick(btc, Date.parse(ts));
    const idea = await decide(perception, cfg);
    if (idea) {
      if (!risk.canTrade()) {
        log('risk-blocked: openRisk '+risk.openRisk.toFixed(2)+'%');
        return;
      }
      const qty = risk.sizeTrade(idea.price);
      const orderIdea = { 
        ...idea, 
        side: idea.side as 'buy'|'sell',
        qty 
      };
      executeIdea(orderIdea, log);
      risk.registerOrder(idea.side as 'buy'|'sell', qty, idea.price);
    }
  }
  
  if (m.type === 'orderResult') {
    console.log(`[${workerData.name}] order result`, m.data);
    const { order } = m.data;
    
    // Add entry timestamp if not present
    if (!order.entryTs) {
      order.entryTs = Date.now() - 1000; // Assume 1 second ago if not provided
    }
    
    await risk.closePosition(order.qty, order.price, order.fee);
    
    // Send metrics update after position close
    parentPort?.postMessage({ 
      type: 'metric', 
      equity: risk.equity, 
      pnl: risk.dayPnL 
    });
    
    // Log the completed trade
    await logCompletedTrade(
      {
        ...order,
        pnl: risk.dayPnL, // Use the risk manager's calculation for consistency
      },
      workerData.name,
      versionId
    );
    
    // Keep the existing experience logging
    await prisma.experience.create({
      data:{
        symbol: order.symbol,
        price:  order.price,
        smcThresh: cfg.smc.thresh,
        rsiOS: cfg.ta.overSold,
        reward: risk.dayPnL   // simplistic reward = daily PnL
      }
    });
  }
}); 