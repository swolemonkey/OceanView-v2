// Minimal server implementation
import Fastify from 'fastify';
import { createLogger } from './utils/logger.js';
import { evolutionCron } from './cron/evolution.js';
import fastifyWebsocket from '@fastify/websocket';
import registerApiRoutes from './routes/index.js';
import { startBots } from './botRunner/index.js';

// Initialize logger
const logger = createLogger('server');

// Create Fastify instance with logger enabled
const app = Fastify({
  logger: true
});

// Register WebSocket plugin
app.register(fastifyWebsocket);

// Register routes
app.register(registerApiRoutes);

// Register healthcheck route
app.get('/healthz', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Get port from environment variable
const port = parseInt(process.env.PORT || '3334', 10);

// Start server
const start = async () => {
  try {
    // Initialize bot runner
    await startBots();
    
    // Start the server
    await app.listen({ port, host: '0.0.0.0' });
    logger.info(`Server started on port ${port}`);
    
    // Log that evolution cron is initialized
    logger.info('Evolution cron scheduler initialized');
  } catch (err) {
    logger.error('Error starting server:', err);
    process.exit(1);
  }
};

start(); 