import './db.js';
import { pollAndStore } from './services/marketData.js';
import Fastify from 'fastify';
import { registerLatestPriceRoute } from './routes/latestPrice.js';

const app = Fastify();

// Start polling market data
setInterval(pollAndStore, 5000);

// Register routes
await registerLatestPriceRoute(app);

// Start server
await app.listen({ port: 3000 });
console.log("server up");

export {}; 