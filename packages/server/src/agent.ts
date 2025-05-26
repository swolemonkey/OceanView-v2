import { AssetAgent } from './bots/hypertrades/assetAgent.js';
import { loadConfig } from './bots/hypertrades/config.js';
import { prisma } from './db.js';
import { getLatestPrices } from './services/marketData.js';
import { getStrategyVersion } from './lib/getVersion.js';

/**
 * Main bot loop that continuously fetches market data, 
 * evaluates strategies, and places simulated trades.
 */
export async function run_bot(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Multi-Asset HyperTrades bot starting up...`);
  
  // Load configuration and initialize agents for each symbol
  const cfg = await loadConfig();
  console.log(`[${new Date().toISOString()}] HyperTrades loaded config for symbols:`, cfg.symbols.join(', '));
  
  // Get strategy version
  const stratVersion = getStrategyVersion();
  const versionRow = await (prisma as any).strategyVersion.upsert({
    where: { hash: stratVersion },
    update: {},
    create: { hash: stratVersion, description: 'auto‑created' }
  });
  const versionId = versionRow.id;
  
  // Initialize agents for each symbol
  const agents = new Map<string, AssetAgent>();
  for (const symbol of cfg.symbols) {
    console.log(`[${new Date().toISOString()}] Creating agent for ${symbol}`);
    agents.set(symbol, new AssetAgent(symbol, cfg, 1, versionId)); // botId 1 for main bot
  }
  
  // Report metrics every minute
  setInterval(() => {
    let totalEquity = 0;
    let totalPnl = 0;
    
    for (const agent of agents.values()) {
      totalEquity += agent.risk.equity;
      totalPnl += agent.risk.dayPnL;
    }
    
    console.log(`[${new Date().toISOString()}] METRICS: Equity: $${totalEquity.toFixed(2)}, PnL: $${totalPnl.toFixed(2)}`);
    
    // Save metrics to database (safely)
    try {
      // Check if the prisma client and metric model exist
      if (prisma && 'metric' in prisma) {
        // @ts-ignore - New schema with Metric model not yet recognized by TypeScript
        prisma.metric.create({ 
          data:{
            botId: 1,
            equity: totalEquity,
            pnl: totalPnl
          }
        }).catch((err: Error) => console.error('[METRICS] Database error:', err.message));
      } else {
        // Just log that we would save metrics, but the model isn't available
        console.log(`[${new Date().toISOString()}] METRICS: Would save to DB if model existed: { botId: 1, equity: ${totalEquity}, pnl: ${totalPnl} }`);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error saving metrics:`, error);
    }
  }, 60000);
  
  // Main loop
  while (true) {
    try {
      const timestamp = new Date().toISOString();
      
      // Fetch latest prices
      console.log(`[${timestamp}] Fetching market data...`);
      const priceData = await getLatestPrices();
      
      if (!priceData) {
        console.log(`[${timestamp}] No price data available, skipping cycle`);
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30 second polling
        continue;
      }
      
      // Process each symbol with its agent
      for (const [symbol, agent] of agents.entries()) {
        // Convert symbol like 'bitcoin' to ticker like 'BTC' for price lookup
        const ticker = symbol === 'bitcoin' ? 'BTC' : 
                      symbol === 'ethereum' ? 'ETH' : 
                      symbol === 'solana' ? 'SOL' : 
                      symbol.toUpperCase();
                      
        const price = priceData[ticker];
        
        if (price) {
          console.log(`[${timestamp}] ${ticker} price: $${price.toFixed(2)}`);
          try {
            await agent.onTick(price, Date.now());
          } catch (err: unknown) {
            console.error(`[${timestamp}] Error processing ${ticker}:`, err);
          }
        } else {
          console.log(`[${timestamp}] No price data for ${symbol} (${ticker}), skipping`);
        }
      }
      
      // Wait for next polling interval (30 seconds)
      await new Promise(resolve => setTimeout(resolve, 30000));
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Bot error:`, error);
      // If there's an error, wait a bit and continue the loop
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
} 