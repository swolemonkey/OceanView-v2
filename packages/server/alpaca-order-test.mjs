// Direct test script for Alpaca Paper Trading orders
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

console.log('Alpaca Paper Trading API credentials:');
console.log('- Key:', alpacaKey ? `${alpacaKey.substring(0, 4)}...` : 'Missing');
console.log('- Secret:', alpacaSecret ? `${alpacaSecret.substring(0, 4)}...` : 'Missing');

// Base URLs for Alpaca
const paperBaseUrl = 'https://paper-api.alpaca.markets';
const dataBaseUrl = 'https://data.alpaca.markets';

// Check account information
async function getAccountInfo() {
  console.log('\nChecking account information...');
  
  try {
    const url = `${paperBaseUrl}/v2/account`;
    console.log(`Sending request to: ${url}`);
    
    const response = await fetch(url, {
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
      return null;
    }
    
    const data = await response.json();
    console.log('Account information:');
    console.log('- Account ID:', data.id);
    console.log('- Status:', data.status);
    console.log('- Equity:', data.equity);
    console.log('- Cash:', data.cash);
    console.log('- Buying Power:', data.buying_power);
    console.log('- Day Trade Count:', data.daytrade_count);
    
    return data;
  } catch (error) {
    console.error('Error getting account info:', error);
    return null;
  }
}

// Get current positions
async function getPositions() {
  console.log('\nFetching current positions...');
  
  try {
    const url = `${paperBaseUrl}/v2/positions`;
    console.log(`Sending request to: ${url}`);
    
    const response = await fetch(url, {
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
      return null;
    }
    
    const positions = await response.json();
    console.log(`Found ${positions.length} positions`);
    
    if (positions.length > 0) {
      console.log('\nCurrent positions:');
      positions.forEach(position => {
        console.log(`- ${position.symbol}: ${position.qty} shares at avg price $${position.avg_entry_price}, current value: $${position.market_value}`);
      });
    }
    
    return positions;
  } catch (error) {
    console.error('Error getting positions:', error);
    return null;
  }
}

// Place a market order
async function placeOrder(symbol, side, quantity) {
  console.log(`\nPlacing ${side} order for ${quantity} shares of ${symbol}...`);
  
  try {
    const orderData = {
      symbol: symbol,
      qty: quantity.toString(),
      side: side.toLowerCase(),
      type: 'market',
      time_in_force: 'day'
    };
    
    const url = `${paperBaseUrl}/v2/orders`;
    console.log(`Sending request to: ${url}`);
    console.log('Order data:', orderData);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'APCA-API-KEY-ID': alpacaKey,
        'APCA-API-SECRET-KEY': alpacaSecret,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    });
    
    const responseText = await response.text();
    console.log(`Response status: ${response.status}`);
    
    try {
      const data = JSON.parse(responseText);
      console.log('Order response:', data);
      
      if (data.id) {
        console.log(`✅ Order placed successfully! Order ID: ${data.id}`);
        console.log(`- Symbol: ${data.symbol}`);
        console.log(`- Side: ${data.side}`);
        console.log(`- Type: ${data.type}`);
        console.log(`- Quantity: ${data.qty}`);
        console.log(`- Status: ${data.status}`);
        
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
async function getOrderHistory() {
  console.log('\nFetching order history...');
  
  try {
    const url = `${paperBaseUrl}/v2/orders?status=all&limit=20`;
    console.log(`Sending request to: ${url}`);
    
    const response = await fetch(url, {
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
      return null;
    }
    
    const orders = await response.json();
    console.log(`Found ${orders.length} orders`);
    
    if (orders.length > 0) {
      console.log('\nRecent orders:');
      // Take the most recent 5 orders
      const recentOrders = orders.slice(0, 5);
      recentOrders.forEach(order => {
        const createDate = new Date(order.created_at).toLocaleString();
        console.log(`- ID: ${order.id}, Symbol: ${order.symbol}, Side: ${order.side}, Qty: ${order.qty}, Status: ${order.status}, Created: ${createDate}`);
      });
    }
    
    return orders;
  } catch (error) {
    console.error('Error getting order history:', error);
    return null;
  }
}

// Check market status
async function getMarketStatus() {
  console.log('\nChecking market status...');
  
  try {
    const url = `${paperBaseUrl}/v2/clock`;
    console.log(`Sending request to: ${url}`);
    
    const response = await fetch(url, {
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
      return null;
    }
    
    const data = await response.json();
    console.log('Market information:');
    console.log('- Current time:', new Date(data.timestamp).toLocaleString());
    console.log('- Market is open:', data.is_open);
    console.log('- Next open:', new Date(data.next_open).toLocaleString());
    console.log('- Next close:', new Date(data.next_close).toLocaleString());
    
    return data;
  } catch (error) {
    console.error('Error getting market status:', error);
    return null;
  }
}

// Get latest price for a symbol
async function getLatestPrice(symbol) {
  console.log(`\nFetching latest price for ${symbol}...`);
  
  try {
    const url = `${dataBaseUrl}/v2/stocks/${symbol}/trades/latest`;
    console.log(`Sending request to: ${url}`);
    
    const response = await fetch(url, {
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
      return null;
    }
    
    const data = await response.json();
    console.log('Latest price data:');
    console.log('- Symbol:', symbol);
    console.log('- Price:', data.trade?.p);
    console.log('- Size:', data.trade?.s);
    console.log('- Timestamp:', new Date(data.trade?.t).toLocaleString());
    
    return data;
  } catch (error) {
    console.error(`Error getting latest price for ${symbol}:`, error);
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
    
    // Check market status
    const marketStatus = await getMarketStatus();
    if (!marketStatus) {
      console.error('❌ Failed to get market status.');
      return;
    }
    
    // Get current positions
    await getPositions();
    
    // Get order history
    await getOrderHistory();
    
    // Define test symbols
    const symbols = ['AAPL', 'MSFT', 'TSLA'];
    
    // Get latest prices for test symbols
    for (const symbol of symbols) {
      await getLatestPrice(symbol);
    }
    
    // Ask user if they want to place orders
    const placeOrders = process.argv.includes('--place-orders');
    if (placeOrders) {
      if (!marketStatus.is_open) {
        console.log('\n⚠️ Market is currently closed. Orders will be queued for the next market open.');
        console.log(`Next market open: ${new Date(marketStatus.next_open).toLocaleString()}`);
      }
      
      // Place small orders for test
      for (const symbol of symbols) {
        // Place a small order
        const quantity = 1; // Just one share for testing
        await placeOrder(symbol, 'buy', quantity);
      }
      
      // Get updated positions
      await getPositions();
      
      // Get updated order history
      await getOrderHistory();
    }
    
  } catch (error) {
    console.error('Fatal error:', error);
  }
}

// Run the script with --place-orders flag to actually place orders
console.log(`\nℹ️ Run with '--place-orders' flag to actually place orders`);
console.log(`   Example: node alpaca-order-test.mjs --place-orders\n`);

main(); 