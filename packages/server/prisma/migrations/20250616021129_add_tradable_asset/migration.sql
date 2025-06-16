-- CreateTable
CREATE TABLE "TradableAsset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DailyMetric" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "strategyVersionId" INTEGER NOT NULL,
    "botName" TEXT NOT NULL,
    "symbol" TEXT NOT NULL DEFAULT '',
    "trades" INTEGER NOT NULL,
    "grossPnl" REAL NOT NULL,
    "netPnl" REAL NOT NULL,
    "winRate" REAL NOT NULL,
    "sharpe" REAL NOT NULL,
    "maxDrawdown" REAL NOT NULL,
    CONSTRAINT "DailyMetric_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DailyMetric" ("botName", "date", "grossPnl", "id", "maxDrawdown", "netPnl", "sharpe", "strategyVersionId", "trades", "winRate") SELECT "botName", "date", "grossPnl", "id", "maxDrawdown", "netPnl", "sharpe", "strategyVersionId", "trades", "winRate" FROM "DailyMetric";
DROP TABLE "DailyMetric";
ALTER TABLE "new_DailyMetric" RENAME TO "DailyMetric";
CREATE UNIQUE INDEX "DailyMetric_date_symbol_strategyVersionId_key" ON "DailyMetric"("date", "symbol", "strategyVersionId");
CREATE TABLE "new_Order" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "qty" DECIMAL NOT NULL,
    "price" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'filled',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL DEFAULT 'market',
    "exchangeOrderId" TEXT,
    "botId" INTEGER,
    "exchange" TEXT,
    "clientOrderId" TEXT
);
INSERT INTO "new_Order" ("createdAt", "id", "price", "qty", "side", "status", "symbol") SELECT "createdAt", "id", "price", "qty", "side", "status", "symbol" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE TABLE "new_Trade" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "qty" DECIMAL NOT NULL,
    "price" DECIMAL NOT NULL,
    "feePaid" DECIMAL NOT NULL DEFAULT 0,
    "pnl" DECIMAL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "botId" INTEGER,
    "fee" DECIMAL,
    "externalId" TEXT,
    "strategy" TEXT,
    "exchangeTradeId" TEXT,
    CONSTRAINT "Trade_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Trade" ("feePaid", "id", "orderId", "pnl", "price", "qty", "side", "symbol", "ts") SELECT "feePaid", "id", "orderId", "pnl", "price", "qty", "side", "symbol", "ts" FROM "Trade";
DROP TABLE "Trade";
ALTER TABLE "new_Trade" RENAME TO "Trade";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "TradableAsset_symbol_key" ON "TradableAsset"("symbol");
