// Test script to validate multi-asset HyperTrades functionality
import { config } from 'dotenv';
// Load environment variables from .env file
config({ path: '../../.env' });

import { AssetAgent } from './src/bots/hypertrades/assetAgent.js';
import { loadConfig } from './src/bots/hypertrades/config.js';

// Test configuration
const TEST_DURATION_MS = 2 * 60 * 1000; // 2 minutes (changed from 1 hour for quick testing)
const CRYPTO_SYMBOL = 'BTC';
const EQUITY_SYMBOL = 'AAPL';
const SMALL_QTY = { crypto: 0.001, equity: 1 }; // Small qty as per requirements 

// Initialize feeds and engines
async function runTest() {
  try {
    await setupSymbolRegistry();
    
    console.log('Initializing data feeds and execution engines...');
    console.log('Environment check:');
    console.log('BINANCE_TESTNET_API_KEY:', process.env.BINANCE_TESTNET_API_KEY ? 'Present (length: ' + process.env.BINANCE_TESTNET_API_KEY.length + ')' : 'Missing');
    console.log('BINANCE_TESTNET_API_SECRET:', process.env.BINANCE_TESTNET_API_SECRET ? 'Present (length: ' + process.env.BINANCE_TESTNET_API_SECRET.length + ')' : 'Missing');
    console.log('ALPACA_API_KEY:', process.env.ALPACA_API_KEY ? 'Present (length: ' + process.env.ALPACA_API_KEY.length + ')' : 'Missing');
    console.log('ALPACA_API_SECRET:', process.env.ALPACA_API_SECRET ? 'Present (length: ' + process.env.ALPACA_API_SECRET.length + ')' : 'Missing');
    
    const coinGeckoFeed = new CoinGeckoFeed();
    const alpacaFeed = new AlpacaFeed();
  } catch (error) {
    console.error('Error initializing test:', error);
  }
}

runTest(); 