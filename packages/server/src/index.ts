import 'dotenv/config';
import './db.js';
import Fastify from 'fastify';
import wsPlugin from './ws.js';
import pino from 'pino';
import { pollAndStore } from './services/marketData.js';
import { registerLatestPriceRoute } from './routes/latestPrice.js';
import { registerOrderRoute } from './routes/order.js';
import { registerHealthzRoute } from './routes/healthz.js';

// Set default environment variables if not set
process.env.COINGECKO_URL = process.env.COINGECKO_URL || "https://api.coingecko.com/api/v3/simple/price";
process.env.COINCAP_URL = process.env.COINCAP_URL || "https://api.coincap.io/v2/assets";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

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

// Start server
await app.listen({ port: 3333 });
logger.info("Server started on port 3333");

// Start bots
import { startBots } from './botRunner/index.js';
await startBots();

export {}; 