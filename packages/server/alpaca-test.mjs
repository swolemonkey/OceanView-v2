// Direct test of Alpaca API endpoints
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from the root .env file
config({ path: resolve(__dirname, '../../.env') });

// Get API credentials
const alpacaKey = process.env.ALPACA_API_KEY || '';
const alpacaSecret = process.env.ALPACA_API_SECRET || '';

console.log('Alpaca API credentials:');
console.log('- Key:', alpacaKey ? `${alpacaKey.substring(0, 4)}...` : 'Missing');
console.log('- Secret:', alpacaSecret ? `${alpacaSecret.substring(0, 4)}...` : 'Missing');

// Test various endpoints
async function testEndpoint(endpoint, description) {
  console.log(`\nTesting ${description} (${endpoint})...`);
  
  try {
    const response = await fetch(endpoint, {
      headers: {
        'APCA-API-KEY-ID': alpacaKey,
        'APCA-API-SECRET-KEY': alpacaSecret
      }
    });
    
    if (!response.ok) {
      console.error(`Error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error(`Response: ${text}`);
      return false;
    }
    
    const data = await response.json();
    console.log('Success!');
    console.log('Data:', JSON.stringify(data, null, 2).substring(0, 200) + '...');
    return true;
  } catch (error) {
    console.error(`Request failed: ${error.message}`);
    return false;
  }
}

// Run tests
async function runTests() {
  // Test various endpoints
  const endpoints = [
    {
      url: 'https://paper-api.alpaca.markets/v2/account',
      description: 'Account endpoint'
    },
    {
      url: 'https://paper-api.alpaca.markets/v2/assets',
      description: 'Assets list'
    },
    {
      url: 'https://paper-api.alpaca.markets/v2/assets/AAPL',
      description: 'AAPL asset details'
    },
    {
      url: 'https://paper-api.alpaca.markets/v2/market/clock',
      description: 'Market clock'
    },
    {
      url: 'https://paper-api.alpaca.markets/v2/calendar',
      description: 'Trading calendar'
    },
    {
      url: 'https://data.alpaca.markets/v2/stocks/AAPL/trades/latest',
      description: 'AAPL latest trades (data API)'
    },
    {
      url: 'https://data.alpaca.markets/v2/stocks/AAPL/quotes/latest',
      description: 'AAPL latest quotes (data API)'
    }
  ];
  
  // Test each endpoint
  let successCount = 0;
  for (const endpoint of endpoints) {
    const success = await testEndpoint(endpoint.url, endpoint.description);
    if (success) successCount++;
  }
  
  console.log(`\n=== TEST RESULTS ===`);
  console.log(`${successCount}/${endpoints.length} endpoints tested successfully`);
  
  if (successCount < endpoints.length) {
    console.log('\nTroubleshooting tips:');
    console.log('- For data API endpoints, you may need separate Market Data API keys');
    console.log('- Check if your API keys have the required permissions');
    console.log('- The correct base URL for market data is data.alpaca.markets, not paper-api.alpaca.markets');
    console.log('- Try using the Alpaca dashboard to verify your account status');
  }
}

runTests(); 