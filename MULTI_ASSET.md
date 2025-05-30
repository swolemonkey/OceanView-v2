# Multi-Asset Trading Implementation

This document describes the multi-asset trading functionality implemented in Sprint 11. The system now supports trading both cryptocurrencies and equities in paper mode.

## Features

- **DataFeed Interface**: Abstraction for receiving market data
  - `CoinGeckoFeed`: For cryptocurrency data
  - `AlpacaFeed`: For equity data with WebSocket (fallback to REST every 60s)

- **ExecutionEngine Interface**: Abstraction for executing trades
  - `SimEngine`: Simulated trading (existing)
  - `AlpacaPaperEngine`: Paper trading for equities
  - `BinanceTestnetEngine`: Testnet trading for cryptocurrencies

- **Flexible AssetAgent**: Updated to accept different data feeds and execution engines
  - Asset class detection via `SymbolRegistry` table
  - Automatic injection of correct feed/execution engine

## Usage

### Setting Up API Keys

For paper trading to work properly, you need to set up API keys:

1. **Alpaca Markets** (for equities):
   - Sign up at [Alpaca Markets](https://alpaca.markets/)
   - Get API keys from your dashboard
   - Set environment variables:
     ```
     ALPACA_API_KEY=your_alpaca_key
     ALPACA_API_SECRET=your_alpaca_secret
     ```

2. **Binance Testnet** (for cryptocurrencies):
   - Sign up at [Binance](https://www.binance.com/)
   - Create testnet API keys at [Binance Testnet](https://testnet.binance.vision/)
   - Set environment variables:
     ```
     BINANCE_TESTNET_API_KEY=your_binance_key
     BINANCE_TESTNET_API_SECRET=your_binance_secret
     ```

### Running the Bot

1. Apply the database migration:
   ```
   node packages/server/scripts/apply-migration.js
   ```

2. Build the server:
   ```
   cd packages/server
   npm run build
   ```

3. Run the multi-asset bot:
   ```
   node packages/server/scripts/run-multi-asset.js
   ```

4. For testing the functionality:
   ```
   node packages/server/dist/test-multi-asset.js
   ```

## Configuration

### Symbol Registry

The system uses a `SymbolRegistry` table to determine the asset class and exchange for each symbol. Default entries include:

- Cryptocurrencies: BTC, ETH, SOL (binance)
- Equities: AAPL, MSFT, AMZN, GOOG, TSLA (nasdaq)

You can add more symbols by inserting records into the `SymbolRegistry` table:

```sql
INSERT INTO "SymbolRegistry" ("symbol", "assetClass", "exchange", "active", "updatedAt") 
VALUES ('SYMBOL', 'assetClass', 'exchange', true, CURRENT_TIMESTAMP);
```

### Retry Mechanism

The system includes exponential backoff retry logic for execution:
- 3 retry attempts
- Delay between retries: 2^attempt seconds
- Full error logging

## Verification

To verify the system is working correctly:

1. Check the Trade table for both crypto and equity fills:
   ```sql
   SELECT * FROM Trade ORDER BY id DESC LIMIT 10;
   ```

2. Verify equity updates correctly:
   ```sql
   SELECT * FROM AccountState ORDER BY updatedAt DESC LIMIT 1;
   ```

## Implementation Details

- The `AssetAgent` constructor now accepts optional `DataFeed` and `ExecutionEngine` parameters
- If not provided, it uses default implementations
- The agent now handles real-time data from feeds via callbacks
- Execution uses retry logic with exponential backoff
- Errors and fills are properly logged to the database

## Troubleshooting

- If API calls fail, the system falls back to simulation
- Check logs for "EXECUTING" and "COMPLETED" messages
- Verify API keys are set correctly
- For database issues, check the schema and migrations 