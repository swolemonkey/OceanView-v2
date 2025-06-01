# OceanView Ops & Observability

This document describes the operations and observability features of the OceanView trading bot.

## API Endpoints

### Metrics Endpoint

**Endpoint**: `/metrics` (GET)  
**Description**: Returns current bot metrics as JSON  
**Usage**: `curl http://localhost:3334/metrics`

**Response Format**:
```json
{
  "equity": 15000,
  "pnl": 250.5,
  "drawdown": 1.2,
  "tradeCount24h": 42,
  "gatekeeperVetoRatio": 0.34,
  "latestSentiment": 0.67,
  "latestOrderBookImbalance": 0.22
}
```

**Field Descriptions**:
- `equity`: Current account equity in USD
- `pnl`: Profit & Loss in USD
- `drawdown`: Current drawdown as a percentage
- `tradeCount24h`: Number of trades executed in the last 24 hours
- `gatekeeperVetoRatio`: Ratio of trades vetoed by the gatekeeper (0-1)
- `latestSentiment`: Latest sentiment score (-1 to +1)
- `latestOrderBookImbalance`: Latest order book imbalance (-1 to +1)

### Controls Endpoint

**Endpoint**: `/controls` (POST)  
**Description**: Updates bot control parameters  
**Usage**: `curl -X POST -H "Content-Type: application/json" -d '{"equity": 15000}' http://localhost:3334/controls`

**Request Body Format**:
```json
{
  "equity": 15000
}
```

**Response Format**:
```json
{
  "equity": 15000
}
```

## CLI Helpers

### Bot Metrics

**Command**: `pnpm run bot:metrics`  
**Description**: Fetches and pretty-prints the current bot metrics  
**Example Output**:
```
=== Bot Metrics ===

Equity:              $15000.00
PnL:                 $250.50
Drawdown:            1.20%
Trades (24h):        42
Gatekeeper Veto:     34.00%
Latest Sentiment:    0.67
Order Book Imbalance: 0.22

```

### Set Equity

**Command**: `pnpm run bot:set-equity -- <amount>`  
**Description**: Updates the bot's equity value  
**Example**: `pnpm run bot:set-equity -- 15000`  
**Example Output**: `Equity successfully updated to $15000.00`

## Cron Jobs

### Daily Health Check

**Schedule**: 07:00 UTC every day  
**Description**: Pulls metrics, computes differences vs. previous day, and logs alerts if thresholds are exceeded  
**Alert Thresholds**:
- Drawdown > 5%
- Trade count < 10 in the last 24 hours

### Heartbeat

**Schedule**: Every 5 minutes  
**Description**: Records a heartbeat entry in the database and increments a statsd counter  
**Statsd Metric**: `bot.heartbeat`  
**Alert**: If no heartbeat is recorded for > 15 minutes, an alert is triggered (via Logflare/Datadog)

## Database Schema

### BotHeartbeat Table

```prisma
model BotHeartbeat {
  id        Int      @id @default(autoincrement())
  ts        DateTime @default(now())
  status    String   // "ok" or "alert"
  details   String?
}
```

## Environment Variables

The following environment variables are relevant for Ops & Observability:

- `PORT`: API server port (default: 3334)

## Deployment

The Ops & Observability features are deployed to the Fly.io staging environment. Logs can be viewed using:

```bash
fly logs -i <instance>
```

Database status can be checked using:

```bash
fly ssh console -C "sqlite3 prisma/dev.db 'select count(*) from BotHeartbeat;'"
``` 