/**
 * Test Environment Variables
 * 
 * This script checks if the environment variables are being loaded correctly.
 */

// Print all environment variables (masking sensitive data)
console.log('Environment Variables:');
console.log('BINANCE_TESTNET_API_KEY:', process.env.BINANCE_TESTNET_API_KEY ? '✅ Found (masked)' : '❌ Missing');
console.log('BINANCE_TESTNET_API_SECRET:', process.env.BINANCE_TESTNET_API_SECRET ? '✅ Found (masked)' : '❌ Missing');
console.log('ALPACA_API_KEY:', process.env.ALPACA_API_KEY ? '✅ Found (masked)' : '❌ Missing');
console.log('ALPACA_API_SECRET:', process.env.ALPACA_API_SECRET ? '✅ Found (masked)' : '❌ Missing');
console.log('COINGECKO_URL:', process.env.COINGECKO_URL || '❌ Missing');
console.log('COINCAP_URL:', process.env.COINCAP_URL || '❌ Missing'); 