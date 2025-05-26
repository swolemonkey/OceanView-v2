// ESM-compatible test for hypertrades bot

import { loadConfig } from './packages/server/src/bots/hypertrades/config.js';
import { AssetAgent } from './packages/server/src/bots/hypertrades/assetAgent.js';
import { Candle } from './packages/server/src/bots/hypertrades/perception.js';

// Mock candle data
const candles = [
  { ts: 1650000000000, o: 40000, h: 40500, l: 39800, c: 40200 },
  { ts: 1650000060000, o: 40200, h: 40400, l: 39500, c: 39600 }, // Stop-hunt candle
  { ts: 1650000120000, o: 39600, h: 40000, l: 39500, c: 39800 }  // Current candle
];

async function runTest() {
  console.log('Starting HyperTrades test with new strategy architecture...');
  
  // Set environment variable for symbols
  process.env.HYPER_SYMBOLS = 'bitcoin,ethereum,solana';
  
  try {
    // Load config
    const cfg = await loadConfig();
    console.log('Loaded config:', cfg);
    
    // Override config for testing
    cfg.smc.thresh = 0.002;      // 0.2% threshold
    cfg.smc.minRetrace = 0.5;    // 50% retracement
    cfg.ta.overSold = 35;        // RSI oversold
    cfg.ta.overBought = 65;      // RSI overbought
    
    // Create agent
    const agent = new AssetAgent('bitcoin', cfg, 1, 1);
    console.log('Created agent for bitcoin');
    
    // Feed initial tick data to create candles
    for (let i = 0; i < 15; i++) {
      await agent.onTick(40000 + (Math.random() * 1000 - 500), 1649999900000 + i * 1000);
    }
    
    // Feed the historical candles to build up the perception
    for (let i = 0; i < candles.length - 1; i++) {
      const candle = candles[i];
      agent.perception.onCandleClose(candle);
      agent.indCache.updateOnClose(candle.c);
    }
    
    console.log('Processed historical candles');
    
    // Simulate a candle close
    console.log('Testing onCandleClose with SMC stop-hunt pattern...');
    await agent.onCandleClose(candles[candles.length - 1]);
    
    console.log('Test completed');
  } catch (error) {
    console.error('Test error:', error);
  }
}

runTest(); 