# Environment Variables

This document lists all environment variables used by the application, including their purpose and default values.

## Database Connection

- `DATABASE_URL` - Connection string for the database
  - Example: `postgresql://postgres:postgres@localhost:5432/ocean_view?schema=public` or `file:./dev.db`

- `REDIS_URL` - Connection string for Redis (optional)
  - Example: `redis://localhost:6379`

## API Keys

- `COINGECKO_API_KEY` - API key for CoinGecko
- `ALPACA_API_KEY` - API key for Alpaca
- `ALPACA_API_SECRET` - API secret for Alpaca
- `POLYGON_API_KEY` - API key for Polygon.io (optional)

## API Endpoints

- `COINGECKO_URL` - URL for CoinGecko API
  - Default: `https://api.coingecko.com/api/v3/simple/price`
- `COINCAP_URL` - URL for CoinCap API
  - Default: `https://api.coincap.io/v2/assets`

## Application Settings

- `PORT` - Port to run the server on
  - Default: `3334`
- `NODE_ENV` - Environment (development, production, test)
  - Default: `development`
- `LOG_LEVEL` - Logging level
  - Default: `info`
  - Options: `error`, `warn`, `info`, `debug`, `trace`

## Feature Flags

- `ENABLE_LIVE_TRADING` - Whether to enable live trading
  - Default: `false`
- `ENABLE_NOTIFICATIONS` - Whether to enable notifications
  - Default: `true`

## Risk Management

- `MAX_DAILY_LOSS_PCT` - Maximum daily loss as a percentage of equity
  - Default: `0.03` (3%)
- `MAX_OPEN_RISK_PCT` - Maximum risk for open positions as a percentage of equity
  - Default: `0.05` (5%)

## Trailing Stop Settings (New)

- `TRAILING_STOP_ENABLED` - Enable/disable trailing stop functionality
  - Default: `true`
- `TRAILING_STOP_THRESHOLD` - Minimum profit percentage before activating trailing stop
  - Default: `0.01` (1%)
- `TRAILING_STOP_DISTANCE` - How far the trailing stop follows price (optional)
  - Default: uses atrMultiple from HyperSettings table

## Example .env File

```
# Database
DATABASE_URL="file:./dev.db"
REDIS_URL="redis://localhost:6379"

# API Keys
COINGECKO_API_KEY="your-key-here"
ALPACA_API_KEY="your-key-here"
ALPACA_API_SECRET="your-secret-here"

# Application Settings
PORT=3334
NODE_ENV="development"
LOG_LEVEL="info"

# Feature Flags
ENABLE_LIVE_TRADING=false
ENABLE_NOTIFICATIONS=true

# Risk Management
MAX_DAILY_LOSS_PCT=0.03
MAX_OPEN_RISK_PCT=0.05

# Trailing Stop Settings
TRAILING_STOP_ENABLED=true
TRAILING_STOP_THRESHOLD=0.01 