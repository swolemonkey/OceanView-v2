import 'dotenv/config';
import './db.js';
import Fastify from 'fastify';
import wsPlugin from './ws.js';
import pino from 'pino';
import { pollAndStore } from './services/marketData.js';
import { registerLatestPriceRoute } from './routes/latestPrice.js';
import { registerOrderRoute } from './routes/order.js';
import { registerHealthzRoute } from './routes/healthz.js';
import { registerPortfolioRoute } from './routes/portfolio.js';
import registerApiRoutes from './routes/index.js';
import { nightlyUpdate } from './bots/hypertrades/learner.js';
import { weeklyFork, weeklyEvaluate } from './bots/hypertrades/forkManager.js';
import { run_bot } from './agent.js'; // HyperTrades bot implementation
import './cron/index.js'; // Initialize cron jobs

// Set default environment variables if not set
process.env.COINGECKO_URL = process.env.COINGECKO_URL || "https://api.coingecko.com/api/v3/simple/price";
process.env.COINCAP_URL = process.env.COINCAP_URL || "https://api.coincap.io/v2/assets";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
process.env.PORT = process.env.PORT || "3334"; // Use port 3334 instead of 3333

// Log configured symbols
const configuredSymbols = process.env.HYPER_SYMBOLS || 'bitcoin';
console.log(`[INIT] HyperTrades configured with symbols: ${configuredSymbols}`);

// Initialize logger
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

// Create Fastify instance with logger enabled
const app = Fastify({
  logger: true // Use Fastify's built-in logger instead of passing our logger
});

// Register plugins
await app.register(wsPlugin);

// Start polling market data - use 15 seconds interval to stay within rate limits
setInterval(pollAndStore, 15000);

// Register routes
await registerLatestPriceRoute(app);
await registerOrderRoute(app);
await registerHealthzRoute(app);
await registerPortfolioRoute(app);
await registerApiRoutes(app);

// Add startup event handler to run the bot using the requested pattern
app.addHook('onReady', async () => {
  console.log('[INIT] Starting Multi-Asset HyperTrades bot with symbols:', configuredSymbols);
  
  // Start the HyperTrades bot in a background task using Promise to not block the main server
  Promise.resolve().then(() => {
    run_bot().catch((err: Error) => {
      console.error('HyperTrades bot error:', err);
    });
  });
  
  logger.info('Multi-Asset HyperTrades bot started in background');
});

// Get port from environment variable
const port = parseInt(process.env.PORT || '3334', 10);

// Start server
await app.listen({ port, host: '0.0.0.0' });
logger.info(`Server started on port ${port}`);

// We don't need to start the bot workers anymore as we've integrated HyperTrades directly
// Keeping these schedules for learning and evaluation

// Schedule nightly learning update - for demo, run every minute instead of midnight
const scheduleUpdate = () => {
  const now = new Date();
  console.log(`[learner] Scheduling next update in 60 seconds`);
  setTimeout(async () => {
    try {
      await nightlyUpdate();
    } catch (err) {
      console.error('[learner] Update error:', err);
    }
    scheduleUpdate();
  }, 60 * 1000); // Run every minute for demo
};

scheduleUpdate();

// Schedule fork operations - replace cron with setInterval
// Run weeklyEvaluate every minute
setInterval(async () => {
  try {
    await weeklyEvaluate();
  } catch (err) {
    console.error('[weeklyEvaluate] Error:', err);
  }
}, 60 * 1000); // every minute for demo

// Run weeklyFork every 5 minutes
setInterval(async () => {
  try {
    await weeklyFork();
  } catch (err) {
    console.error('[weeklyFork] Error:', err);
  }
}, 5 * 60 * 1000); // every 5 min for demo

export {}; 