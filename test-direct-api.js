// Direct API test with explicit credentials
import { config } from 'dotenv';
config({ path: '../../.env' });

// Log the credentials (first 4 chars only for security)
const binanceKey = process.env.BINANCE_TESTNET_API_KEY || '';
const binanceSecret = process.env.BINANCE_TESTNET_API_SECRET || '';
const alpacaKey = process.env.ALPACA_API_KEY || '';
const alpacaSecret = process.env.ALPACA_API_SECRET || '';

console.log('API Keys:');
console.log('- Binance Key:', binanceKey ? `${binanceKey.substring(0, 4)}...` : 'Missing');
console.log('- Binance Secret:', binanceSecret ? `${binanceSecret.substring(0, 4)}...` : 'Missing');
console.log('- Alpaca Key:', alpacaKey ? `${alpacaKey.substring(0, 4)}...` : 'Missing');
console.log('- Alpaca Secret:', alpacaSecret ? `${alpacaSecret.substring(0, 4)}...` : 'Missing');

// Test Binance API - Simple account query
async function testBinance() {
  try {
    console.log('\nTesting Binance Testnet API...');
    const crypto = await import('crypto');
    const fetch = await import('node-fetch');
    
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = crypto.default
      .createHmac('sha256', binanceSecret)
      .update(queryString)
      .digest('hex');
    
    const url = `https://testnet.binance.vision/api/v3/account?${queryString}&signature=${signature}`;
    console.log(`Sending request to: ${url.replace(signature, '***')}`);
    
    const response = await fetch.default(url, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': binanceKey
      }
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`Error: ${response.status} ${response.statusText}`);
      console.error(error);
      return false;
    }
    
    const data = await response.json();
    console.log('Binance API success! Account type:', data.accountType);
    console.log('Permissions:', data.permissions);
    return true;
  } catch (error) {
    console.error('Binance API test failed:', error);
    return false;
  }
}

// Test Alpaca API - Simple account query
async function testAlpaca() {
  try {
    console.log('\nTesting Alpaca Paper Trading API...');
    const fetch = await import('node-fetch');
    
    const url = 'https://paper-api.alpaca.markets/v2/account';
    console.log(`Sending request to: ${url}`);
    
    const response = await fetch.default(url, {
      method: 'GET',
      headers: {
        'APCA-API-KEY-ID': alpacaKey,
        'APCA-API-SECRET-KEY': alpacaSecret
      }
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`Error: ${response.status} ${response.statusText}`);
      console.error(error);
      return false;
    }
    
    const data = await response.json();
    console.log('Alpaca API success! Account ID:', data.id);
    console.log('Status:', data.status);
    return true;
  } catch (error) {
    console.error('Alpaca API test failed:', error);
    return false;
  }
}

// Run both tests
async function runTests() {
  const binanceSuccess = await testBinance();
  const alpacaSuccess = await testAlpaca();
  
  console.log('\n=== TEST RESULTS ===');
  console.log('Binance Testnet API:', binanceSuccess ? '✅ Working' : '❌ Failed');
  console.log('Alpaca Paper Trading API:', alpacaSuccess ? '✅ Working' : '❌ Failed');
  
  if (!binanceSuccess || !alpacaSuccess) {
    console.log('\nTroubleshooting tips:');
    if (!binanceSuccess) {
      console.log('- Make sure your Binance Testnet API keys are correct and have the right permissions');
      console.log('- Check that the API keys were generated from https://testnet.binance.vision/');
    }
    if (!alpacaSuccess) {
      console.log('- Make sure your Alpaca Paper Trading API keys are correct');
      console.log('- Verify you\'re using Paper Trading keys, not live keys');
      console.log('- Check that your API keys have market data access permissions');
    }
  }
}

runTests(); 