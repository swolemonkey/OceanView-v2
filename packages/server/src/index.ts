import './db.js';
import Fastify from 'fastify';
import wsPlugin from './ws.js';
import { pollAndStore } from './services/marketData.js';
import { registerLatestPriceRoute } from './routes/latestPrice.js';
import { registerOrderRoute } from './routes/order.js';

const app = Fastify();

// Register plugins
await app.register(wsPlugin);

// Start polling market data
setInterval(pollAndStore, 5000);

// Register routes
await registerLatestPriceRoute(app);
await registerOrderRoute(app);

// Start server
await app.listen({ port: 3000 });
console.log("server up");

export {}; 