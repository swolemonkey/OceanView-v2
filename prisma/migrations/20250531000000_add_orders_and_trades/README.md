# Migration `20250531000000_add_orders_and_trades`

This migration adds:

1. Order table for tracking order execution
2. Trade table for tracking partial fills and individual trade executions
3. Index on RLDataset(symbol, ts) to speed up updateOutcome lookups

## Changes

```sql
-- CreateTable
CREATE TABLE "Order" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "qty" REAL NOT NULL,
    "price" REAL,
    "status" TEXT NOT NULL,
    "exchange" TEXT,
    "exchangeOrderId" TEXT,
    "clientOrderId" TEXT,
    "botId" INTEGER NOT NULL,
    "fee" REAL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fillTs" DATETIME
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "qty" REAL NOT NULL,
    "price" REAL NOT NULL,
    "fee" REAL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exchangeTradeId" TEXT,
    "strategy" TEXT,
    CONSTRAINT "Trade_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RLDataset_symbol_ts_idx" ON "RLDataset"("symbol", "ts");
``` 