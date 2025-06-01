# Sprint 9: Ops & Observability PR

## Overview

This PR implements the Ops & Observability features for Sprint 9, providing essential monitoring and control capabilities for the trading bot.

## Features Implemented

### 1. API & CLI Endpoints

- **Metrics Endpoint**: Added `/metrics` GET endpoint that returns JSON with:
  - equity, PnL, drawdown
  - last-24h trade count
  - gatekeeper veto ratio
  - latest sentiment & order-book imbalance

- **Controls Endpoint**: Added `/controls` POST endpoint that:
  - Updates AccountState.equity
  - Persists the value to the database
  - Echoes the updated value

- **CLI Helpers**: Added two convenience scripts:
  - `pnpm run bot:metrics` - pretty-prints the metrics data
  - `pnpm run bot:set-equity -- <amount>` - updates the equity value

### 2. Cron & Alert Hooks

- **Daily Health Check**: Added 07:00 UTC cron job that:
  - Pulls metrics and computes changes vs. yesterday
  - Logs alerts if drawdown > 5% or trade count < 10
  - Will later integrate with Slack notifications

- **Heartbeat**: Added heartbeat mechanism that:
  - Records to database at startup and every 5 minutes
  - Simulates statsd.increment('bot.heartbeat')
  - Will page via Logflare/Datadog if gap > 15 min

### 3. Schema Extensions & Tests

- **BotHeartbeat Table**: Added new table with:
  - id, ts, status (ok/alert), details (text)
  - Created migration and updated Prisma types

- **Unit Tests**: Added Jest tests for:
  - metrics controller
  - equity setter
  - heartbeat functionality

### 4. Documentation

- Added `docs/ops.md` with details on:
  - Available endpoints
  - Cron schedule
  - Environment variables

- Updated PR template with new sections for:
  - Environment variables
  - Migrations
  - Cron jobs

## Definition of Done

- [x] Create branch sprint-9-ops
- [x] Implement all requested features
- [x] Add unit tests
- [x] Add documentation
- [x] Create PR into staging branch

## Next Steps

The branch is ready to be deployed to Fly.io staging for smoke testing.

After deployment, the following should be checked:
1. Run `pnpm run start:docker` locally for 30-60 min
2. Check `pnpm run bot:metrics` to confirm values update
3. Verify cron logs fire correctly
4. Test on Fly staging using `fly logs -i <instance>`
5. Check heartbeat recording with `fly ssh console -> sqlite3 prisma/dev.db 'select count(*) from BotHeartbeat;'` 