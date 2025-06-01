# Hyperparameter Evolution System

The Evolution System automates the process of discovering optimal trading strategy parameters through a genetic algorithm approach.

## How It Works

1. **Nightly Evolution Cycle**:
   - Runs automatically at 3:00 AM UTC
   - Spawns N child trading bots with mutated parameters (±10% variation)
   - Each child runs for 24 hours on paper trading
   - Performance metrics (Sharpe ratio and drawdown) are calculated
   - Results are stored in the `EvolutionMetric` table
   - Best-performing child parameters are promoted to the main strategy

2. **Parameter Mutation**:
   - All numeric parameters are randomly adjusted within a ±10% range
   - Non-numeric parameters are preserved unchanged
   - This creates subtle variations of the current strategy

3. **Performance Evaluation**:
   - Sharpe ratio (returns divided by volatility) is the primary metric
   - Drawdown is considered as a risk constraint
   - A child is only promoted if it has a better Sharpe ratio than the parent

## Database Schema

The system uses the `EvolutionMetric` table to track results:

```prisma
model EvolutionMetric {
  id          Int      @id @default(autoincrement())
  parentId    Int
  childId     Int
  sharpe      Float
  drawdown    Float
  promoted    Boolean  @default(false)
  childParams Json
  ts          DateTime @default(now())
}
```

## Manual Triggering

You can manually trigger an evolution run using the CLI:

```bash
pnpm evolution:run
```

This is useful for testing or when you want to run an evolution outside the scheduled time.

## Architecture

The evolution system consists of several components:

1. **parameterManager.ts**: Contains the core mutation and evaluation logic
2. **runner.ts**: Orchestrates the spawn-evaluate-promote cycle
3. **evolution.ts** (cron): Schedules the nightly runs
4. **evolution.ts** (script): CLI entry point for manual triggering

## Monitoring

You can monitor the evolution results by querying the `EvolutionMetric` table:

```sql
SELECT * FROM EvolutionMetric ORDER BY ts DESC LIMIT 10;
```

Look for records with `promoted = true` to see which parameter sets were promoted to the main strategy. 