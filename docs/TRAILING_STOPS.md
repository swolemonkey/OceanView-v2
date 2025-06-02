# Trailing Stop Implementation Guide

## Overview

The trailing stop feature adds dynamic stop-loss capability to the trading system. Instead of a fixed stop-loss, the trailing stop "follows" the price as it moves favorably, helping to lock in profits while still allowing room for normal price fluctuations.

## Configuration Parameters

### Database Parameters

The following parameters are stored in the `HyperSettings` table:

- `atrMultiple` (default: 1.5) - Multiplier for the Average True Range (ATR) to determine stop distance
- `atrPeriod` (default: 14) - Number of periods to use for calculating ATR

### Environment Variables

- `TRAILING_STOP_ENABLED` - Master toggle for trailing stop functionality (true/false)
- `TRAILING_STOP_THRESHOLD` - Minimum profit percentage required before activating trailing stop (e.g., 0.01 for 1%)
- `TRAILING_STOP_DISTANCE` - Optional override for the ATR-based distance calculation

## How It Works

1. When a position is opened, the system calculates the initial stop-loss based on the ATR
2. As the price moves favorably, the system tracks the highest (for long positions) or lowest (for short positions) price reached
3. Once the position reaches the profit threshold defined by `TRAILING_STOP_THRESHOLD`, the trailing stop is activated
4. The stop-loss is moved to trail the price by the distance calculated from the ATR multiplier
5. If the price reverses and hits the trailing stop, the position is closed automatically

## Implementation Details

### Calculation Method

The trailing stop distance is calculated as:

```
stopDistance = ATR(atrPeriod) * atrMultiple
```

Where ATR is the Average True Range over the specified period.

### Activation Logic

```typescript
// Pseudocode
if (unrealizedProfit >= entryPrice * TRAILING_STOP_THRESHOLD) {
  // Activate trailing stop
  if (positionDirection === 'long') {
    trailingStopPrice = Math.max(
      currentTrailingStop, 
      highestPrice - stopDistance
    );
  } else {
    trailingStopPrice = Math.min(
      currentTrailingStop,
      lowestPrice + stopDistance
    );
  }
}
```

## Setup Steps

1. Run database migrations to add the trailing stop fields:
   ```bash
   pnpm prisma migrate dev --name add_trailing_stop_fields
   ```

2. Update your environment configuration (.env file) with the new variables:
   ```
   TRAILING_STOP_ENABLED=true
   TRAILING_STOP_THRESHOLD=0.01
   ```

3. Seed the database with initial values:
   ```bash
   pnpm ts-node scripts/seedAll.ts
   ```

## Debugging and Monitoring

The trailing stop calculations and activations are logged in the standard application logs. Look for entries with the following prefixes:

- `[TRAILING_STOP] Calculating...` - Initial calculation of stop values
- `[TRAILING_STOP] Activating...` - When a trailing stop becomes active
- `[TRAILING_STOP] Updating...` - When a trailing stop level is adjusted
- `[TRAILING_STOP] Triggered...` - When a position is closed due to hitting the trailing stop

## Best Practices

- Start with conservative settings (larger ATR multiple) and adjust based on backtesting results
- Consider different ATR multiples for different market conditions or asset classes
- Monitor the effectiveness of trailing stops through the performance metrics dashboard 