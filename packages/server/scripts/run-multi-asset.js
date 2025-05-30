#!/usr/bin/env node
const { run_bot } = require('../dist/agent.js');

console.log('Starting Multi-Asset Trading Bot...');

// Set environment variables for testing
process.env.HYPER_SYMBOLS = 'bitcoin,ethereum,AAPL,MSFT';
process.env.ALPACA_API_KEY = process.env.ALPACA_API_KEY || '';
process.env.ALPACA_API_SECRET = process.env.ALPACA_API_SECRET || '';
process.env.BINANCE_TESTNET_API_KEY = process.env.BINANCE_TESTNET_API_KEY || '';
process.env.BINANCE_TESTNET_API_SECRET = process.env.BINANCE_TESTNET_API_SECRET || '';

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
});

// Run the bot
run_bot().catch(err => {
  console.error('Fatal error in bot:', err);
  process.exit(1);
}); 