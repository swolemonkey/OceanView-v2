import { parentPort, workerData } from 'worker_threads';
import { loadConfig } from '../../bots/hypertrades/config.js';
import { AssetAgent } from '../../bots/hypertrades/assetAgent.js';
import { logCompletedTrade } from '../../bots/hypertrades/execution.js';
import { prisma } from '../../db.js';
import type { Candle } from '../../bots/hypertrades/perception.js';
import { PortfolioRiskManager } from '../../risk/portfolioRisk.js';
import { RLGatekeeper, FeatureVector } from '../../rl/gatekeeper.js';

const log = (...a:any[]) => console.log(`[hypertrades]`, ...a);

// Initialize config
let versionId: number;
const agents = new Map<string, AssetAgent>();
// Track last candle times for each symbol
const lastCandleTimes = new Map<string, number>();
// Portfolio risk manager
let portfolio: PortfolioRiskManager;
// RL Gatekeeper
let rlGatekeeper: RLGatekeeper;
// Trading halted flag
let tradingHalted = false;
// Track RL dataset entries by order ID
const rlEntryIds = new Map<string, number>();

async function init() {
  // Get config and bot info
  const cfg = await loadConfig();
  
  // Use default values if workerData is null
  const botData = workerData || { botId: 1, stratVersion: 'dev-local' };
  const { botId, stratVersion } = botData as { botId: number; stratVersion: string };
  
  console.log(`HyperTrades loaded config for symbols: ${cfg.symbols.join(',')}`);
  
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
    lastCandleTimes.set(symbol, 0);
  }
  
  // Initialize portfolio risk manager with config
  portfolio = new PortfolioRiskManager();
  await portfolio.init();
  
  // Initialize RL Gatekeeper
  rlGatekeeper = new RLGatekeeper(versionId);
  
  // Report metrics every minute - combined from all agents
  setInterval(() => {
    let totalEquity = 0;
    let totalPnl = 0;
    
    for (const agent of agents.values()) {
      totalEquity += agent.risk.equity;
      totalPnl += agent.risk.dayPnL;
    }
    
    // Update portfolio risk manager
    portfolio.recalc(agents);
    
    // Check if trading should be halted due to risk limits
    const canTrade = portfolio.canTrade();
    if (!canTrade && !tradingHalted) {
      log('TRADING HALTED - Risk limits exceeded');
      tradingHalted = true;
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
    
    // Get current minute timestamp (truncated to minute)
    const currentMinute = Math.floor(epoch / 60000) * 60000;
    
    // Process ticks for each agent if price data is available
    for (const [symbol, agent] of agents.entries()) {
      const price = prices[symbol]?.usd;
      if (!price) continue;
      
      // Process the tick
      await agent.onTick(price, epoch);
      
      // Get the last recorded candle time for this symbol
      const lastCandleTime = lastCandleTimes.get(symbol) || 0;
      
      // If we've moved to a new minute, the previous candle has closed
      if (currentMinute > lastCandleTime && lastCandleTime > 0) {
        // Get the last candle from perception (the one that just closed)
        const lastCandles = agent.perception.last(1);
        if (lastCandles.length > 0) {
          const closedCandle: Candle = lastCandles[0];
          
          // Update portfolio risk metrics before processing trade ideas
          portfolio.recalc(agents);
          
          // Check if we can trade based on portfolio risk limits
          if (!portfolio.canTrade()) {
            tradingHalted = true;
            log(`Trading halted for ${symbol} - Portfolio risk limits exceeded`);
            
            // Skip trade processing
            lastCandleTimes.set(symbol, currentMinute);
            continue;
          }
          
          // Call onCandleClose with the closed candle to process trade ideas
          await agent.onCandleClose(closedCandle);
          log(`Closed candle for ${symbol} at ${new Date(closedCandle.ts).toISOString()}`);
        }
      }
      
      // Update the last candle time for this symbol
      lastCandleTimes.set(symbol, currentMinute);
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
    
    // Close the position using agent's closePositions method which updates portfolio risk
    await agent.closePositions(order.price);
    
    // Get the RL entry ID for this order
    const entryId = rlEntryIds.get(`${order.symbol}-${order.entryTs}`);
    
    // Update RL Dataset with outcome (individual trade PnL)
    if (entryId) {
      try {
        await rlGatekeeper.updateOutcome(entryId, order.pnl);
        // Remove the entry from our tracking map after updating
        rlEntryIds.delete(`${order.symbol}-${order.entryTs}`);
      } catch (error) {
        console.error('Error updating RL outcome:', error);
      }
    }
    
    // Send metrics update after position close - combined from all agents
    let totalEquity = 0;
    let totalPnl = 0;
    
    for (const a of agents.values()) {
      totalEquity += a.risk.equity;
      totalPnl += a.risk.dayPnL;
    }
    
    // Update portfolio risk manager
    portfolio.recalc(agents);
    
    // Check if trading can resume after this position close
    if (!tradingHalted && portfolio.canTrade()) {
      console.log(`[${workerData.name}] Trading enabled - Portfolio risk metrics within limits`);
    } else if (tradingHalted && portfolio.canTrade()) {
      tradingHalted = false;
      console.log(`[${workerData.name}] Trading resumed - Portfolio risk metrics now within limits`);
      console.log(`Open risk: ${portfolio.openRiskPct.toFixed(2)}%, Daily PnL: $${portfolio.dayPnl.toFixed(2)}`);
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
        pnl: order.pnl, // Use the individual trade PnL
      },
      workerData.name,
      versionId
    );
  }
});

// Helper function to store RL entry ID when a trade is initiated
export function storeRLEntryId(symbol: string, timestamp: number, id: number): void {
  rlEntryIds.set(`${symbol}-${timestamp}`, id);
} 