# Sprint 6 - Strategy Pack & Gatekeeper CLI

This PR adds two new trading strategies and the ability to toggle strategies per symbol via configuration.

## Changes

### 1. Strategy Toggle Configuration

- Added `strategyToggle` JSON column to HyperSettings table
- Updated config loader to parse JSON toggle settings
- Modified AssetAgent to dynamically load strategies based on toggle

Example toggle config:
```json
{
  "bitcoin": {
    "smcReversal": true,
    "trendFollowMA": true,
    "rangeBounce": false
  },
  "ethereum": {
    "smcReversal": false,
    "trendFollowMA": true,
    "rangeBounce": true
  }
}
```

### 2. New Strategies

#### TrendFollowMA
- Joins pullbacks when fastMA > slowMA (trend-following)
- Triggers buy signals when price retraces to within 0.2% of the fast moving average in an uptrend

#### RangeBounce
- Fades highs/lows in low-volatility ranges with RSI filters
- Buys oversold conditions (RSI < 30) near range support
- Sells overbought conditions (RSI > 70) near range resistance

### 3. Gatekeeper CLI

- Added `gatekeeper:train` script to package.json
- Created `scripts/gatekeeper.ts` to expose Gatekeeper retraining via CLI
- Can be run with `pnpm run gatekeeper:train`

### 4. Misc Cleanup

- Removed any global TypeScript installations from Docker setup
- Added tests for new strategies
- Ensured clean integration with existing code

## Testing

- Unit tests confirm both strategies trigger signals under appropriate conditions
- Verified strategy toggle behavior works correctly
- Tested gatekeeper training script execution

## Definition of Done

- [x] CI green, build passes with new lockfile
- [x] Local bot prints "Trend MA pull‑back" / "Range bounce long" when enabled
- [x] `pnpm run gatekeeper:train` inserts a new RLModel row 