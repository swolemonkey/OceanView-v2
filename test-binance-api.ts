/**
 * Test Binance Testnet API Connection
 */
import { config } from 'dotenv';
import crypto from 'crypto';
import fetch from 'node-fetch';

// Load environment variables from .env file
config({ path: '../../.env' });

// Get API credentials
const apiKey = process.env.BINANCE_TESTNET_API_KEY;
const apiSecret = process.env.BINANCE_TESTNET_API_SECRET;
const baseUrl = 'https://testnet.binance.vision/api';

console.log('Binance Testnet API Test');
console.log('API Key:', apiKey ? `Present (${apiKey.substring(0, 4)}...)` : 'Missing');
console.log('API Secret:', apiSecret ? `Present (${apiSecret.substring(0, 4)}...)` : 'Missing');

async function testConnection() {
  try {
    console.log('\nTesting account balance endpoint...');
    
    // Generate signature for Binance API
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    
    const signature = crypto
      .createHmac('sha256', apiSecret!)
      .update(queryString)
      .digest('hex');
    
    // Send request to Binance Testnet
    const requestUrl = `${baseUrl}/v3/account?${queryString}&signature=${signature}`;
    console.log(`Sending request to: ${baseUrl}/v3/account?timestamp=${timestamp}&signature=***`);
    
    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': apiKey!
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Binance API error: ${response.status} ${response.statusText}`);
      console.error(`Response: ${errorText}`);
      return;
    }
    
    const accountInfo = await response.json();
    console.log('\nAccount info successfully retrieved!');
    console.log('Account Type:', accountInfo.accountType);
    console.log('Can Trade:', accountInfo.canTrade);
    console.log('Maker Commission:', accountInfo.makerCommission);
    console.log('Taker Commission:', accountInfo.takerCommission);
    
    // List some balances
    console.log('\nBalances:');
    const nonZeroBalances = accountInfo.balances.filter((b: any) => 
      parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
    );
    
    nonZeroBalances.forEach((balance: any) => {
      console.log(`${balance.asset}: Free=${balance.free}, Locked=${balance.locked}`);
    });
    
    console.log('\n✅ Binance Testnet API is working correctly!');
  } catch (error) {
    console.error('Error testing Binance API:', error);
  }
}

// Run the test
if (apiKey && apiSecret) {
  testConnection();
} else {
  console.error('\n❌ Missing API credentials. Please check your .env file.');
} 