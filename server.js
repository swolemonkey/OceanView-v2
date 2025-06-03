// Simple Express server for deployment testing
import express from 'express';
import { createServer } from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { run_bot } from './packages/server/dist/src/agent.js';
import { pollAndStore } from './packages/server/dist/src/services/marketData.js';
import { getActiveModel } from './packages/server/dist/src/rl/modelPromotion.js';
import { gate } from './packages/server/dist/src/rl/gatekeeper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 3334;
const HOST = '0.0.0.0';  // Always bind to all interfaces

console.log(`Starting server on ${HOST}:${PORT}`);

// Check if UI build exists
const uiDistPath = join(__dirname, 'packages/ui/dist');
if (fs.existsSync(uiDistPath)) {
  console.log(`UI build found at: ${uiDistPath}`);
  const files = fs.readdirSync(uiDistPath);
  console.log(`UI build directory contains: ${files.join(', ')}`);
} else {
  console.error(`UI build NOT found at: ${uiDistPath}`);
}

// Health check endpoint that Fly.io will use
app.get('/healthz', (req, res) => {
  console.log('Health check received');
  res.status(200).send({ status: 'ok', timestamp: new Date().toISOString() });
});

// API endpoint
app.get('/api/hello', (req, res) => {
  console.log('API request received');
  res.status(200).send({ message: 'Hello from the API!' });
});

// Serve static files from UI build
app.use(express.static(join(__dirname, 'packages/ui/dist')));

// For any other request, serve the UI (SPA routing)
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'packages/ui/dist/index.html'));
});

// Initialize the Gatekeeper model
async function initializeGatekeeper() {
  try {
    console.log('Initializing Gatekeeper model...');
    const activeModel = await getActiveModel();
    
    if (activeModel) {
      console.log(`Loading active model: ${activeModel.version}`);
      console.log(`Model path: ${activeModel.path}`);
      await gate.init(activeModel.path);
      console.log('Gatekeeper model initialized successfully');
    } else {
      console.log('No active model found in database');
    }
  } catch (error) {
    console.error('Error initializing Gatekeeper:', error);
  }
}

// Start the server
server.listen(PORT, HOST, async () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  
  // Initialize the Gatekeeper model
  await initializeGatekeeper();
  
  // Start market data polling
  console.log('Starting market data polling...');
  setInterval(pollAndStore, 15000);
  
  // Initial poll to get market data
  await pollAndStore();
  
  // Start the HyperTrades bot in background
  console.log('Starting HyperTrades bot...');
  Promise.resolve().then(() => {
    run_bot().catch(err => {
      console.error('HyperTrades bot error:', err);
    });
  });
  
  console.log('Server initialization complete');
}); 