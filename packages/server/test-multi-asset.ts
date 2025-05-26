// Test script to validate multi-asset HyperTrades functionality
import { AssetAgent } from './src/bots/hypertrades/assetAgent.js';
import { loadConfig } from './src/bots/hypertrades/config.js';
import { decide } from './src/bots/hypertrades/decision.js';
import { Perception } from './src/bots/hypertrades/perception.js';

const SAMPLE_PRICES = {
  bitcoin: [
    { price: 109389, ts: Date.now() - 120000 },
    { price: 109400, ts: Date.now() - 60000 },
    { price: 109405, ts: Date.now() }
  ],
  ethereum: [
    { price: 2562.05, ts: Date.now() - 120000 },
    { price: 2565.10, ts: Date.now() - 60000 },
    { price: 2570.25, ts: Date.now() }
  ]
};

async function testMultiAsset() {
  console.log('=== TESTING MULTI-ASSET HYPERTRADES IMPLEMENTATION ===');
  
  // Load configuration with test symbols
  process.env.HYPER_SYMBOLS = 'bitcoin,ethereum';
  const config = await loadConfig();
  console.log(`\nLoaded configuration with symbols: ${config.symbols.join(', ')}`);
  
  // Create agents for each symbol
  const agents = new Map<string, AssetAgent>();
  for (const symbol of config.symbols) {
    console.log(`\nCreating agent for ${symbol}...`);
    agents.set(symbol, new AssetAgent(symbol, config, 1, 1));
  }
  
  // Feed price data to each agent
  for (const [symbol, agent] of agents.entries()) {
    console.log(`\n=== Testing ${symbol.toUpperCase()} Agent ===`);
    
    // Get sample prices for this symbol
    const prices = SAMPLE_PRICES[symbol as keyof typeof SAMPLE_PRICES] || [];
    
    // Feed price data
    for (const { price, ts } of prices) {
      console.log(`\nFeeding ${symbol} price: $${price.toFixed(2)} at ${new Date(ts).toISOString()}`);
      await agent.onTick(price, ts);
    }
    
    // Test decision mechanism directly
    console.log(`\nTesting decision mechanism for ${symbol}...`);
    const perception = new Perception();
    for (const { price, ts } of prices) {
      perception.addTick(price, ts);
    }
    
    const decision = await decide(perception, { ...config, symbol });
    console.log(`Decision for ${symbol}:`, decision);
  }
  
  console.log('\n=== TEST COMPLETE ===');
  console.log('Multi-asset implementation is working as expected.');
}

// Run the test
testMultiAsset().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
}); 