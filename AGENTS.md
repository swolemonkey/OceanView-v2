# Ocean-View V2 · **Hypertrades Agents Guide**

This guide summarizes key components and workflows for the Hypertrades trading bots. Future agents should follow these notes when modifying the repository.

## 1. High-level architecture

```
┌──────────────┐ ticks ┌───────────────┐ TradeIdea ┌───────────────┐
│  Data Feed   │ ─────► │  AssetAgent   │ ─────────►│ Gatekeeper RL │
└──────────────┘   │     (strategies) │ veto/approve └───────────────┘
   ▲   fills order │                         │ score
   │               ▼                         │
┌──────────────┐ ┌───────────────┐ update ┌──────────────┐
│  Execution   │◄─│ RiskManager  │◄───────│  Metrics DB  │
│    Engine    │   └─────────────┘        └──────────────┘
```

- One **AssetAgent** per symbol (BTC, ETH, AAPL, …)
- Each agent hosts a **strategy list** that emits `TradeIdea`s
- The **Gatekeeper** (ONNX logistic regression) vetoes low-probability ideas
- **RiskManager** sizes positions (ATR adaptive) and records PnL
- **ExecutionEngine** routes orders to Binance Futures, spot test-net, or Alpaca

## 2. Key runtime classes

| File | Responsibility |
|------|---------------|
| `bots/hypertrades/assetAgent.ts` | Runs strategies, queries Gatekeeper, delegates to RiskManager |
| `bots/hypertrades/strategies/*`  | Signal modules implementing `onCandle` / `onTick` |
| `bots/hypertrades/perception.ts` | Maintains rolling candles + indicator cache |
| `bots/hypertrades/risk.ts`       | Position sizing and trailing logic |
| `execution/binanceFuturesEngine.ts` | Test‑net futures engine (supports shorts) |
| `execution/binanceSpotEngine.ts` | Spot paper engine |
| `execution/alpacaEngine.ts`      | Alpaca paper trading for equities |
| `loader.ts`                      | Instantiates agents based on `TradableAsset` rows |

## 3. Database schema

- `TradableAsset` table holds symbol, `assetClass` (`future` \| `spot` \| `equity`), and `active` flag
- `HyperSettings` stores per-bot riskPct and `strategyToggle` JSON
- `Trade`, `Order` and `DailyMetric` capture fills and performance metrics
- Migrations live in `packages/server/prisma/migrations`
- Run `pnpm prisma migrate dev --schema packages/server/prisma/schema.prisma -n <name>` to add new migrations

Seed data using `pnpm ts-node seed/seedAll.ts` which now populates 20 `TradableAsset` rows.

## 4. Asset onboarding workflow

Add a new row in `seedAll.ts` (or via Prisma Studio). Loader automatically creates an agent for each active asset on startup. To disable a symbol, set `active` to `false` in the database.

## 5. Execution engines

| Engine file | assetClass | Short support | Notes |
|-------------|-----------|---------------|-------|
| `execution/binanceFuturesEngine.ts` | `future` | Yes | Uses Binance Futures test-net |
| `execution/binanceSpotEngine.ts` | `spot` | No | Demo spot trading |
| `execution/alpacaEngine.ts` | `equity` | Yes | Alpaca paper account |

## 6. Strategy modules

Current strategies:

- `TrendFollowMA` – enter near fast MA when above/below slow MA
- `RangeBounce` – buy near range lows when RSI oversold
- `VolatilityBreakout` – trade BB breakouts with RSI confirmation
- `MeanReversionBand` – fade moves outside Bollinger bands
- `PullbackToTrend` – small pullbacks during established trend
- `FVGReversal` – fade fair‑value gaps with RSI extremes

Toggle strategies per symbol via `HyperSettings.strategyToggle` JSON.

## 7. Risk & portfolio controls

Position size is calculated as:

```
risk$ = equity × riskPct × ATR_factor
qty   = risk$ / |entry − stop|
```

The ATR factor scales down size in high volatility environments.

## 8. Back‑testing and CI

Run `pnpm run backtest BTC ETH AAPL` to replay historical CSVs. The dashboard shows a Back‑Test card using `/metrics/backtest`.
CI replay tests live in `tests/e2e/replaySmoke.test.ts` and require at least one veto, one long, and one short.

## 9. Secrets and deployment

Secrets for API keys are stored with Fly.io:

```bash
fly secrets set \
  ALPACA_API_KEY_ID=pk-xxxxx \
  ALPACA_API_SECRET_KEY=sk-xxxxx \
  BINANCE_SPOT_API_KEY=sb-xxxxx \
  BINANCE_SPOT_SECRET=ss-xxxxx \
  BINANCE_FUT_API_KEY=fb-xxxxx \
  BINANCE_FUT_SECRET=fs-xxxxx
```

Staging app: `ocean-staging`. Production uses blue/green deployments.

