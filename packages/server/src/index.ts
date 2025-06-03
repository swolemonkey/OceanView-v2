import 'dotenv/config';
import './db.js';
import Fastify from 'fastify';
import wsPlugin from './ws.js';
import * as pino from 'pino';
import { prisma } from './db.js';
import { pollAndStore } from './services/marketData.js';
import { registerLatestPriceRoute } from './routes/latestPrice.js';
import { registerOrderRoute } from './routes/order.js';
import { registerHealthzRoute } from './routes/healthz.js';
import { registerPortfolioRoute } from './routes/portfolio.js';
import registerApiRoutes from './routes/index.js';
import { registerMetricsRoute } from './routes/metrics.js';
import { registerControlsRoute } from './routes/controls.js';
import { nightlyUpdate } from './bots/hypertrades/learner.js';
import { weeklyFork, weeklyEvaluate } from './bots/hypertrades/forkManager.js';
import { run_bot } from './agent.js'; // HyperTrades bot implementation
import './cron/index.js'; // Initialize cron jobs
// import '../cron/evolution.js'; // Initialize evolution cron job
import { initHeartbeat } from './services/heartbeat.js';
import { initHealthCheck } from './cron/health-check.js';
import cron from 'node-cron';
import { createLogger } from './utils/logger.js';
import { gate } from './rl/gatekeeper.js';
import { getActiveModel, registerOnnxModel, updateModelFilePaths } from './rl/modelPromotion.js';
import { retrainGatekeeper } from './rl/retrainJob.js';
import fs from 'fs';
import path from 'path';

// Initialize logger
const logger = createLogger('server');

// Set default environment variables if not set
process.env.COINGECKO_URL = process.env.COINGECKO_URL || "https://api.coingecko.com/api/v3/simple/price";
process.env.COINCAP_URL = process.env.COINCAP_URL || "https://api.coincap.io/v2/assets";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
process.env.PORT = process.env.PORT || "3334"; // Use port 3334 instead of 3333

// Log configured symbols
const configuredSymbols = process.env.HYPER_SYMBOLS || 'bitcoin';
logger.info(`HyperTrades configured with symbols: ${configuredSymbols}`);

// Default ONNX model path
const DEFAULT_MODEL_PATH = 'ml/gatekeeper_v1.onnx';

// Initialize RLModel in the database
async function initializeRLModel() {
  try {
    // First, update file paths to ensure they match actual files
    await updateModelFilePaths();
    
    // Get the active model (the one with version starting with gatekeeper_primary)
    const activeModel = await getActiveModel();
    
    // If no active model exists, initialize with the default v1 model
    if (!activeModel) {
      // Check if default model file exists
      if (!fs.existsSync(DEFAULT_MODEL_PATH)) {
        logger.error(`Default model file ${DEFAULT_MODEL_PATH} not found`);
        throw new Error(`Default model file ${DEFAULT_MODEL_PATH} not found`);
      }
      
      // Create initial model entry
      const newModel = await registerOnnxModel(
        DEFAULT_MODEL_PATH,
        'Initial baseline gatekeeper model'
      );
      
      // Promote it to be the active model (this will rename it to gatekeeper_primary{id})
      await prisma.rLModel.update({
        where: { id: newModel.id },
        data: { version: `gatekeeper_primary${newModel.id}` }
      });
      
      logger.info(`Gatekeeper initialized with default model ${DEFAULT_MODEL_PATH}`);
      
      // Initialize the model
      await gate.init(DEFAULT_MODEL_PATH);
    } else {
      logger.info(`Gatekeeper using existing model ${activeModel.path}`);
      
      // Check if the model file exists
      if (!fs.existsSync(activeModel.path)) {
        logger.error(`Model file ${activeModel.path} not found, falling back to default`);
        // Fall back to default if the file doesn't exist
        await gate.init(DEFAULT_MODEL_PATH);
      } else {
        // Initialize the model with the path from the database
        await gate.init(activeModel.path);
      }
    }

    // Load gatekeeper threshold from database
    const hyperSettings = await prisma.hyperSettings.findUnique({ where: { id: 1 } });
    const gatekeeperThresh = hyperSettings?.gatekeeperThresh || 0.55;
    logger.info(`Gatekeeper threshold set to ${gatekeeperThresh}`);

    // Check and initialize account state
    const accountState = await prisma.accountState.findFirst();
    if (accountState) {
      logger.info(`Portfolio loaded starting equity from DB: ${accountState.equity}`);
    } else {
      await prisma.accountState.upsert({
        where: { id: 1 },
        update: { equity: 10000 },
        create: { equity: 10000 }
      });
      logger.info(`Portfolio initialized starting equity: 10000`);
    }
  } catch (error) {
    logger.error('Error initializing RLModel:', { error });
    // Critical error - exit the process so Fly.io will restart it
    process.exit(1);
  }
}

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
await registerMetricsRoute(app);
await registerControlsRoute(app);

// Add startup event handler to run the bot using the requested pattern
app.addHook('onReady', async () => {
  logger.info(`Starting Multi-Asset HyperTrades bot with symbols: ${configuredSymbols}`);
  
  // Initialize RLModel before starting the bot
  await initializeRLModel();
  
  // Initialize heartbeat service
  initHeartbeat();
  
  // Initialize daily health check
  initHealthCheck();
  
  // Start the HyperTrades bot in a background task using Promise to not block the main server
  Promise.resolve().then(() => {
    run_bot().catch((err: Error) => {
      logger.error('HyperTrades bot error:', { error: err });
    });
  });
  
  logger.info('Multi-Asset HyperTrades bot started in background');
});

// Get port from environment variable
const port = parseInt(process.env.PORT || '3334', 10);

// Connect to Prisma before starting the server
await prisma.$connect();

// Start server
await app.listen({ port, host: '0.0.0.0' });
logger.info(`Server started on port ${port}`);

// Schedule nightly learning update
cron.schedule('0 0 * * *', async () => {
  try {
    await nightlyUpdate();
    logger.info('Nightly learning update completed');
  } catch (err) {
    logger.error('Nightly learning update error:', { error: err });
  }
});

// Schedule weekly model retraining with automatic promotion
// Runs every Monday at 2:00 UTC (before the fork at 3:00)
cron.schedule('0 2 * * 1', async () => {
  try {
    // Retrain with auto-promotion enabled
    const result = await retrainGatekeeper({ autoPromote: true });
    if (result.promoted) {
      logger.info(`Weekly model retraining completed - Promoted new model ID ${result.id} to primary`);
    } else {
      logger.info(`Weekly model retraining completed - Current model retained`);
    }
  } catch (err) {
    logger.error('Weekly model retraining error:', { error: err });
  }
});

// Schedule weekly fork/evaluation with real-world cadence
// Weekly fork runs Monday at 03:00 UTC
cron.schedule('0 3 * * 1', async () => {
  try {
    await weeklyFork();
    logger.info('Weekly fork completed successfully');
  } catch (err) {
    logger.error('Weekly fork error:', { error: err });
  }
});

// Weekly evaluation runs Sunday at 03:00 UTC
cron.schedule('0 3 * * 0', async () => {
  try {
    await weeklyEvaluate();
    logger.info('Weekly evaluation completed successfully');
  } catch (err) {
    logger.error('Weekly evaluation error:', { error: err });
  }
});

export {}; 