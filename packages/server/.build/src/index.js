import 'dotenv/config';
import './db.js';
import Fastify from 'fastify';
import wsPlugin from './ws.js';
import pino from 'pino';
import { pollAndStore } from './services/marketData.js';
import { registerLatestPriceRoute } from './routes/latestPrice.js';
import { registerOrderRoute } from './routes/order.js';
import { registerHealthzRoute } from './routes/healthz.js';
import { nightlyUpdate } from './bots/hypertrades/learner.js';
import cron from 'node-cron';
import { weeklyFork, weeklyEvaluate } from './bots/hypertrades/forkManager.js';
// Set default environment variables if not set
process.env.COINGECKO_URL = process.env.COINGECKO_URL || "https://api.coingecko.com/api/v3/simple/price";
process.env.COINCAP_URL = process.env.COINCAP_URL || "https://api.coincap.io/v2/assets";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
process.env.PORT = process.env.PORT || "3334"; // Use port 3334 instead of 3333
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
// Get port from environment variable
const port = parseInt(process.env.PORT || '3334', 10);
// Start server
await app.listen({ port, host: '0.0.0.0' });
logger.info(`Server started on port ${port}`);
// Start bots
import { startBots } from './botRunner/index.js';
await startBots();
// Schedule nightly learning update - for demo, run every minute instead of midnight
const scheduleUpdate = () => {
    const now = new Date();
    console.log(`[learner] Scheduling next update in 60 seconds`);
    setTimeout(async () => {
        try {
            await nightlyUpdate();
        }
        catch (err) {
            console.error('[learner] Update error:', err);
        }
        scheduleUpdate();
    }, 60 * 1000); // Run every minute for demo
};
scheduleUpdate();
// Schedule fork operations - run every minute/5 minutes for demo
cron.schedule('* * * * *', weeklyEvaluate); // every minute for demo
cron.schedule('*/5 * * * *', weeklyFork); // every 5 min for demo
