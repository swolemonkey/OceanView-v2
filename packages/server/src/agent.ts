import { AssetAgent } from './bots/hypertrades/assetAgent.js';
import { loadConfig } from './bots/hypertrades/config.js';
import { prisma } from './db.js';
import { getLatestPrices } from './services/marketData.js';
import { getStrategyVersion } from './lib/getVersion.js';
import { CoinGeckoFeed, AlpacaFeed } from './feeds/index.js';
import { SimEngine, AlpacaPaperEngine, BinanceTestnetEngine } from './execution/index.js';
import type { DataFeed } from './feeds/interface.js';
import type { ExecutionEngine } from './execution/interface.js';

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
  
  // Get symbol registry for asset classes
  const symbolRegistry = await getOrCreateSymbolRegistry(cfg.symbols);
  
  // Initialize data feeds
  const coinGeckoFeed = new CoinGeckoFeed();
  const alpacaFeed = new AlpacaFeed();
  
  // Initialize execution engines
  const simEngine = new SimEngine(1); // botId 1 for main bot
  const alpacaPaperEngine = new AlpacaPaperEngine(undefined, undefined, 1);
  const binanceTestnetEngine = new BinanceTestnetEngine(undefined, undefined, 1);
  
  // Initialize agents for each symbol
  const agents = new Map<string, AssetAgent>();
  for (const symbol of cfg.symbols) {
    console.log(`[${new Date().toISOString()}] Creating agent for ${symbol}`);
    
    // Get the appropriate feed and execution engine based on asset class
    const { feed, executionEngine } = getEnginesForSymbol(
      symbol, 
      symbolRegistry, 
      { coinGecko: coinGeckoFeed, alpaca: alpacaFeed },
      { sim: simEngine, alpaca: alpacaPaperEngine, binance: binanceTestnetEngine }
    );
    
    agents.set(
      symbol, 
      new AssetAgent(symbol, cfg, 1, versionId, feed, executionEngine)
    );
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

/**
 * Helper function to get or create the symbol registry entries
 */
async function getOrCreateSymbolRegistry(symbols: string[]): Promise<Record<string, { assetClass: string, exchange?: string }>> {
  // Default mappings for known symbols
  const defaultRegistry: Record<string, { assetClass: string, exchange?: string }> = {
    'bitcoin': { assetClass: 'crypto', exchange: 'binance' },
    'ethereum': { assetClass: 'crypto', exchange: 'binance' },
    'solana': { assetClass: 'crypto', exchange: 'binance' },
    'AAPL': { assetClass: 'equity', exchange: 'nasdaq' },
    'MSFT': { assetClass: 'equity', exchange: 'nasdaq' },
    'TSLA': { assetClass: 'equity', exchange: 'nasdaq' },
    'AMZN': { assetClass: 'equity', exchange: 'nasdaq' },
    'GOOG': { assetClass: 'equity', exchange: 'nasdaq' }
  };
  
  // Get existing registry entries
  const existingEntries = await (prisma as any).symbolRegistry.findMany({
    where: {
      symbol: { in: symbols }
    }
  });
  
  // Create a map of symbol to registry info
  const registry: Record<string, { assetClass: string, exchange?: string }> = {};
  
  // Add existing entries to the registry
  for (const entry of existingEntries) {
    registry[entry.symbol] = {
      assetClass: entry.assetClass,
      exchange: entry.exchange || undefined
    };
  }
  
  // Find symbols that need to be created
  const symbolsToCreate = symbols.filter(symbol => !registry[symbol]);
  
  // Create entries for missing symbols
  if (symbolsToCreate.length > 0) {
    const createdEntries = await Promise.all(
      symbolsToCreate.map(async (symbol) => {
        // Use default mapping if available, otherwise default to 'crypto'
        const defaultInfo = defaultRegistry[symbol] || { assetClass: 'crypto' };
        
        return (prisma as any).symbolRegistry.create({
          data: {
            symbol,
            assetClass: defaultInfo.assetClass,
            exchange: defaultInfo.exchange
          }
        });
      })
    );
    
    // Add created entries to the registry
    for (const entry of createdEntries) {
      registry[entry.symbol] = {
        assetClass: entry.assetClass,
        exchange: entry.exchange || undefined
      };
    }
  }
  
  return registry;
}

/**
 * Helper function to get the appropriate feed and execution engine for a symbol
 */
function getEnginesForSymbol(
  symbol: string,
  registry: Record<string, { assetClass: string, exchange?: string }>,
  feeds: { coinGecko: DataFeed, alpaca: DataFeed },
  engines: { sim: ExecutionEngine, alpaca: ExecutionEngine, binance: ExecutionEngine }
): { feed: DataFeed, executionEngine: ExecutionEngine } {
  // Get registry info for this symbol (default to crypto if not found)
  const info = registry[symbol] || { assetClass: 'crypto' };
  
  let feed: DataFeed;
  let executionEngine: ExecutionEngine;
  
  // Select the appropriate feed based on asset class
  switch (info.assetClass) {
    case 'crypto':
      feed = feeds.coinGecko;
      // For crypto, use binance testnet for execution if exchange is binance
      executionEngine = info.exchange === 'binance' ? engines.binance : engines.sim;
      break;
    case 'equity':
      feed = feeds.alpaca;
      // For equities, use Alpaca paper trading
      executionEngine = engines.alpaca;
      break;
    default:
      // Default to simulation for unknown asset classes
      feed = feeds.coinGecko;
      executionEngine = engines.sim;
  }
  
  return { feed, executionEngine };
} 