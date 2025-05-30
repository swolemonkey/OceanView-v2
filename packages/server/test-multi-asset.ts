// Test script to validate multi-asset HyperTrades functionality
import { AssetAgent } from './src/bots/hypertrades/assetAgent.js';
import { loadConfig } from './src/bots/hypertrades/config.js';
import { decide } from './src/bots/hypertrades/decision.js';
import { Perception } from './src/bots/hypertrades/perception.js';
import { CoinGeckoFeed, AlpacaFeed } from './src/feeds/index.js';
import { SimEngine, AlpacaPaperEngine, BinanceTestnetEngine } from './src/execution/index.js';
import type { Tick } from './src/feeds/interface.js';
import type { Order, Fill } from './src/execution/interface.js';
import { prisma } from './src/db.js';

const SAMPLE_PRICES = {
  bitcoin: [
    { price: 109389, ts: Date.now() - 120000 },
    { price: 109400, ts: Date.now() - 60000 },
    { price: 109405, ts: Date.now() }
  ],
  ethereum: [
    { price: 2562.05, ts: Date.now() - 120000 },
    { price: 2565.10, ts: Date.now() - 60000 },
    { price: 2570.25, ts: Date.now() }
  ]
};

// Test configuration
const TEST_DURATION_MS = 60 * 60 * 1000; // 1 hour
const CRYPTO_SYMBOL = 'BTC';
const EQUITY_SYMBOL = 'AAPL';
const SMALL_QTY = { crypto: 0.001, equity: 1 }; // Small qty as per requirements

// Test asset registry
async function setupSymbolRegistry() {
  console.log('Setting up symbol registry...');
  
  // Ensure SymbolRegistry exists
  await (prisma as any).symbolRegistry.upsert({
    where: { symbol: CRYPTO_SYMBOL },
    update: { assetClass: 'crypto', exchange: 'binance' },
    create: { symbol: CRYPTO_SYMBOL, assetClass: 'crypto', exchange: 'binance' }
  });
  
  await (prisma as any).symbolRegistry.upsert({
    where: { symbol: EQUITY_SYMBOL },
    update: { assetClass: 'equity', exchange: 'nasdaq' },
    create: { symbol: EQUITY_SYMBOL, assetClass: 'equity', exchange: 'nasdaq' }
  });
  
  console.log('Symbol registry setup complete');
}

// Initialize feeds and engines
async function runTest() {
  try {
    await setupSymbolRegistry();
    
    console.log('Initializing data feeds and execution engines...');
    const coinGeckoFeed = new CoinGeckoFeed();
    const alpacaFeed = new AlpacaFeed();
    
    const binanceEngine = new BinanceTestnetEngine();
    const alpacaEngine = new AlpacaPaperEngine();
    
    console.log('Starting test for BTC and AAPL...');
    
    // Set up tick handlers for both assets
    coinGeckoFeed.subscribe(CRYPTO_SYMBOL, async (tick: Tick) => {
      console.log(`[${new Date().toISOString()}] ${CRYPTO_SYMBOL} tick: $${tick.price.toFixed(2)}`);
      
      // Execute a small test order every 15 minutes for crypto
      const now = new Date();
      if (now.getMinutes() % 15 === 0 && now.getSeconds() < 10) {
        await executeTestTrade('crypto', tick.price, binanceEngine);
      }
    });
    
    alpacaFeed.subscribe(EQUITY_SYMBOL, async (tick: Tick) => {
      console.log(`[${new Date().toISOString()}] ${EQUITY_SYMBOL} tick: $${tick.price.toFixed(2)}`);
      
      // Execute a small test order every 15 minutes for equity
      const now = new Date();
      if (now.getMinutes() % 15 === 0 && now.getSeconds() < 10) {
        await executeTestTrade('equity', tick.price, alpacaEngine);
      }
    });
    
    // Run test for the specified duration
    console.log(`Test will run for ${TEST_DURATION_MS / (60 * 1000)} minutes`);
    setTimeout(() => {
      console.log('Test complete! Checking results...');
      verifyResults().then(() => {
        process.exit(0);
      });
    }, TEST_DURATION_MS);
    
  } catch (error) {
    console.error('Error running test:', error);
    process.exit(1);
  }
}

// Execute a test trade
async function executeTestTrade(assetType: 'crypto' | 'equity', price: number, engine: any) {
  const symbol = assetType === 'crypto' ? CRYPTO_SYMBOL : EQUITY_SYMBOL;
  const qty = SMALL_QTY[assetType];
  const side = Math.random() > 0.5 ? 'buy' : 'sell'; // Randomly buy or sell
  
  console.log(`[${new Date().toISOString()}] Executing test ${side} for ${qty} ${symbol} @ $${price.toFixed(2)}`);
  
  try {
    // Create order
    const order: Order = {
      symbol,
      side,
      qty,
      price,
      type: 'market'
    };
    
    // Execute with retry logic
    const fill = await executeWithRetry(engine, order);
    
    console.log(`[${new Date().toISOString()}] Test trade completed: ${fill.qty} ${symbol} @ $${fill.price.toFixed(2)}, fee: $${fill.fee.toFixed(6)}`);
    return fill;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error executing test trade:`, error);
    return null;
  }
}

// Execute with retry logic
async function executeWithRetry(engine: any, order: Order, maxRetries = 3): Promise<Fill> {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Add exponential backoff delay for retries
      if (attempt > 0) {
        const delay = Math.pow(2, attempt) * 1000; // 2^attempt seconds
        console.log(`[${new Date().toISOString()}] Retry attempt ${attempt + 1} after ${delay/1000}s delay`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // Execute the order
      return await engine.place(order);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Execution attempt ${attempt + 1} failed:`, error);
      lastError = error;
    }
  }
  
  // If we get here, all attempts failed
  console.error(`[${new Date().toISOString()}] All ${maxRetries} execution attempts failed`);
  throw lastError;
}

// Verify results by checking the database
async function verifyResults() {
  console.log('Querying database for trades...');
  
  // Query trades for both assets
  const cryptoTrades = await (prisma as any).trade.findMany({
    where: { symbol: CRYPTO_SYMBOL },
    orderBy: { id: 'desc' },
    take: 10
  });
  
  const equityTrades = await (prisma as any).trade.findMany({
    where: { symbol: EQUITY_SYMBOL },
    orderBy: { id: 'desc' },
    take: 10
  });
  
  console.log(`Found ${cryptoTrades.length} ${CRYPTO_SYMBOL} trades:`);
  for (const trade of cryptoTrades) {
    console.log(`- ${trade.side} ${trade.qty} @ $${trade.price.toFixed(2)}, fee: $${trade.feePaid.toFixed(6)}`);
  }
  
  console.log(`Found ${equityTrades.length} ${EQUITY_SYMBOL} trades:`);
  for (const trade of equityTrades) {
    console.log(`- ${trade.side} ${trade.qty} @ $${trade.price.toFixed(2)}, fee: $${trade.feePaid.toFixed(6)}`);
  }
  
  // Get account equity
  const account = await (prisma as any).accountState.findFirst({
    orderBy: { updatedAt: 'desc' }
  });
  
  if (account) {
    console.log(`Current account equity: $${account.equity.toFixed(2)}`);
  } else {
    console.log('No account state found in database');
  }
  
  // Test is successful if we have at least one trade for each asset
  return cryptoTrades.length > 0 && equityTrades.length > 0;
}

// Run the test
runTest().catch(error => {
  console.error('Fatal error running test:', error);
  process.exit(1);
}); 