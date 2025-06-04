# Prisma Schema

This is the primary Prisma schema for the OceanView application. The schema was consolidated from two separate schemas to simplify the application structure.

## Usage

All Prisma commands should be run from the `packages/server` directory:

```bash
cd packages/server
pnpm exec prisma generate
pnpm exec prisma migrate dev
pnpm exec prisma studio
```

Or using the npm scripts from the root directory:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

## Schema Features

The schema includes models for:

- Price data (Price1m with OHLCV structure)
- Trading (Orders, Trades)
- Bots (Bot, Metrics)
- Strategy management (StrategyVersion, StrategyTrade)
- Risk management (HyperSettings, PortfolioMetric)
- Machine learning (RLModel, RLDataset)
- System monitoring (BotHeartbeat)

## Migration

This schema was consolidated from two separate schemas in June 2025 to simplify the application architecture. 