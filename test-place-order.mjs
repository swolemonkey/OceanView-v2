// Load environment variables
import { config } from 'dotenv';
import { BinanceTestnetEngine } from './dist/src/execution/binanceTestnet.js';

// Load dotenv from the root directory
config({ path: '../../.env' });

console.log('Testing Binance order placement...');
console.log('API Key:', process.env.BINANCE_TESTNET_API_KEY ? 'Present' : 'Missing');
console.log('API Secret:', process.env.BINANCE_TESTNET_API_SECRET ? 'Present' : 'Missing');

// Create engine with credentials
const engine = new BinanceTestnetEngine(
  process.env.BINANCE_TESTNET_API_KEY,
  process.env.BINANCE_TESTNET_API_SECRET
);

// Place a small test order
const testOrder = {
  symbol: 'BTCUSDT',
  side: 'buy',
  qty: 0.001,
  price: 50000,
  type: 'market'
};

async function placeOrder() {
  try {
    console.log(`Placing order: ${testOrder.side} ${testOrder.qty} ${testOrder.symbol}...`);
    const fill = await engine.place(testOrder);
    console.log('Order successfully placed!');
    console.log('Fill details:', fill);
    return fill;
  } catch (error) {
    console.error('Error placing order:', error);
  }
}

placeOrder(); 