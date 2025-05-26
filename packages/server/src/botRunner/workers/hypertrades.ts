import { parentPort, workerData } from 'worker_threads';
import { loadConfig } from '../../bots/hypertrades/config.js';
import { AssetAgent } from '../../bots/hypertrades/assetAgent.js';
import { logCompletedTrade } from '../../bots/hypertrades/execution.js';
import { prisma } from '../../db.js';

const log = (...a:any[]) => console.log(`[hypertrades]`, ...a);

// Initialize config
let versionId: number;
const agents = new Map<string, AssetAgent>();

async function init() {
  // Get config and bot info
  const cfg = await loadConfig();
  const { botId, stratVersion } = workerData as { botId: number; stratVersion: string };
  
  // Upsert the strategy version
  const versionRow = await (prisma as any).strategyVersion.upsert({
    where: { hash: stratVersion },
    update: {},
    create: { hash: stratVersion, description: 'auto‑created' }
  });
  versionId = versionRow.id;
  log('Using strategy version:', stratVersion, 'ID:', versionId);
  
  // Create an agent for each configured symbol
  for (const symbol of cfg.symbols) {
    log(`Creating agent for ${symbol}`);
    agents.set(symbol, new AssetAgent(symbol, cfg, botId, versionId));
  }
  
  // Report metrics every minute - combined from all agents
  setInterval(() => {
    let totalEquity = 0;
    let totalPnl = 0;
    
    for (const agent of agents.values()) {
      totalEquity += agent.risk.equity;
      totalPnl += agent.risk.dayPnL;
    }
    
    parentPort?.postMessage({ 
      type: 'metric', 
      equity: totalEquity, 
      pnl: totalPnl 
    });
  }, 60000);
}

init().catch(err => console.error('[hypertrades] init error:', err));

parentPort?.on('message', async (m) => {
  if (m.type === 'tick') {
    const { prices, ts } = JSON.parse(m.data);
    const epoch = Date.parse(ts);
    
    // Process ticks for each agent if price data is available
    for (const [symbol, agent] of agents.entries()) {
      const price = prices[symbol]?.usd;
      if (price) {
        await agent.onTick(price, epoch);
      }
    }
  }
  
  if (m.type === 'orderResult') {
    console.log(`[${workerData.name}] order result`, m.data);
    const { order } = m.data;
    
    // Find the agent for this symbol
    const agent = agents.get(order.symbol);
    if (!agent) {
      console.error(`No agent found for symbol ${order.symbol}`);
      return;
    }
    
    // Add entry timestamp if not present
    if (!order.entryTs) {
      order.entryTs = Date.now() - 1000; // Assume 1 second ago if not provided
    }
    
    await agent.risk.closePosition(order.qty, order.price, order.fee);
    
    // Send metrics update after position close - combined from all agents
    let totalEquity = 0;
    let totalPnl = 0;
    
    for (const a of agents.values()) {
      totalEquity += a.risk.equity;
      totalPnl += a.risk.dayPnL;
    }
    
    parentPort?.postMessage({ 
      type: 'metric', 
      equity: totalEquity, 
      pnl: totalPnl 
    });
    
    // Log the completed trade
    await logCompletedTrade(
      {
        ...order,
        pnl: agent.risk.dayPnL, // Use the risk manager's calculation for consistency
      },
      workerData.name,
      versionId
    );
  }
}); 