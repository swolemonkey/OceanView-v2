// Direct test script for Binance Testnet orders
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import crypto from 'crypto';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from the root .env file
config({ path: resolve(__dirname, '../../.env') });

// Get API credentials
const binanceKey = process.env.BINANCE_TESTNET_API_KEY || '';
const binanceSecret = process.env.BINANCE_TESTNET_API_SECRET || '';

console.log('Binance Testnet API credentials:');
console.log('- Key:', binanceKey ? `${binanceKey.substring(0, 4)}...` : 'Missing');
console.log('- Secret:', binanceSecret ? `${binanceSecret.substring(0, 4)}...` : 'Missing');

// Base URL for Binance Testnet
const baseUrl = 'https://testnet.binance.vision/api';

// Check account information first
async function getAccountInfo() {
  console.log('\nChecking account information...');
  
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = crypto
      .createHmac('sha256', binanceSecret)
      .update(queryString)
      .digest('hex');
    
    const url = `${baseUrl}/v3/account?${queryString}&signature=${signature}`;
    console.log(`Sending request to: ${url.replace(signature, '***')}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': binanceKey
      }
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`Error: ${response.status} ${response.statusText}`);
      console.error(error);
      return null;
    }
    
    const data = await response.json();
    console.log('Account information:');
    console.log('- Account type:', data.accountType);
    console.log('- Can trade:', data.canTrade);
    console.log('- Permissions:', data.permissions);
    
    // Print balances with amounts > 0
    console.log('\nBalances:');
    const balances = data.balances.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
    balances.forEach(b => {
      console.log(`- ${b.asset}: Free ${b.free}, Locked ${b.locked}`);
    });
    
    return data;
  } catch (error) {
    console.error('Error getting account info:', error);
    return null;
  }
}

// Place a market order
async function placeOrder(symbol, side, quantity) {
  console.log(`\nPlacing ${side} order for ${quantity} ${symbol}...`);
  
  try {
    // Prepare parameters for Binance API
    const timestamp = Date.now();
    const queryParams = new URLSearchParams({
      symbol: symbol,
      side: side.toUpperCase(),
      type: 'MARKET',
      quantity: quantity.toString(),
      timestamp: timestamp.toString()
    });
    
    // Generate signature for Binance API
    const signature = crypto
      .createHmac('sha256', binanceSecret)
      .update(queryParams.toString())
      .digest('hex');
    
    queryParams.append('signature', signature);
    
    // Send request to Binance Testnet
    const requestUrl = `${baseUrl}/v3/order?${queryParams.toString()}`;
    console.log(`Sending request to: ${requestUrl.replace(signature, '***')}`);
    
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': binanceKey
      }
    });
    
    const responseText = await response.text();
    console.log(`Response status: ${response.status}`);
    
    try {
      const data = JSON.parse(responseText);
      console.log('Order response:', data);
      
      if (data.orderId) {
        console.log(`✅ Order placed successfully! Order ID: ${data.orderId}`);
        console.log(`- Symbol: ${data.symbol}`);
        console.log(`- Side: ${data.side}`);
        console.log(`- Type: ${data.type}`);
        console.log(`- Quantity: ${data.origQty}`);
        console.log(`- Status: ${data.status}`);
        
        if (data.fills && data.fills.length > 0) {
          console.log('- Fills:');
          data.fills.forEach(fill => {
            console.log(`  - Price: ${fill.price}, Quantity: ${fill.qty}`);
          });
        }
        
        return data;
      } else {
        console.error('❌ No order ID returned');
        return null;
      }
    } catch (e) {
      console.error('❌ Error parsing JSON response:', e);
      console.error('Raw response:', responseText);
      return null;
    }
  } catch (error) {
    console.error('❌ Error placing order:', error);
    return null;
  }
}

// Get order history
async function getOrderHistory(symbol) {
  console.log(`\nFetching order history for ${symbol}...`);
  
  try {
    const timestamp = Date.now();
    const queryParams = new URLSearchParams({
      symbol: symbol,
      timestamp: timestamp.toString()
    });
    
    const signature = crypto
      .createHmac('sha256', binanceSecret)
      .update(queryParams.toString())
      .digest('hex');
    
    queryParams.append('signature', signature);
    
    const url = `${baseUrl}/v3/allOrders?${queryParams.toString()}`;
    console.log(`Sending request to: ${url.replace(signature, '***')}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': binanceKey
      }
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`Error: ${response.status} ${response.statusText}`);
      console.error(error);
      return null;
    }
    
    const orders = await response.json();
    console.log(`Found ${orders.length} orders for ${symbol}`);
    
    if (orders.length > 0) {
      console.log('\nRecent orders:');
      // Sort by time descending (newest first) and take last 5
      const recentOrders = [...orders].sort((a, b) => b.time - a.time).slice(0, 5);
      recentOrders.forEach(order => {
        const date = new Date(order.time).toISOString();
        console.log(`- ID: ${order.orderId}, Type: ${order.type}, Side: ${order.side}, Status: ${order.status}, Quantity: ${order.origQty}, Date: ${date}`);
      });
    }
    
    return orders;
  } catch (error) {
    console.error('Error getting order history:', error);
    return null;
  }
}

// Main function
async function main() {
  try {
    // Check account info first
    const account = await getAccountInfo();
    if (!account) {
      console.error('❌ Failed to get account information. Check your API keys.');
      return;
    }
    
    // Define symbols to test with
    const symbols = ['BTCUSDT', 'ETHUSDT'];
    
    for (const symbol of symbols) {
      // Get order history
      await getOrderHistory(symbol);
      
      // Ask user if they want to place an order
      const placeOrders = process.argv.includes('--place-orders');
      if (placeOrders) {
        // Place a small buy order
        const quantity = symbol === 'BTCUSDT' ? 0.001 : 0.01; // Small amount for testing
        await placeOrder(symbol, 'BUY', quantity);
        
        // Check order history again after placing the order
        await getOrderHistory(symbol);
      }
    }
    
  } catch (error) {
    console.error('Fatal error:', error);
  }
}

// Run the script with --place-orders flag to actually place orders
console.log(`\nℹ️ Run with '--place-orders' flag to actually place orders`);
console.log(`   Example: node binance-order-test.mjs --place-orders\n`);

main(); 