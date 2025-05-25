-- CreateTable
CREATE TABLE "StrategyVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "hash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT
);

-- CreateTable
CREATE TABLE "StrategyTrade" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "botName" TEXT NOT NULL,
    "strategyVersionId" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "size" REAL NOT NULL,
    "entryReason" TEXT NOT NULL,
    "exitReason" TEXT,
    "pnl" REAL NOT NULL,
    "durationMs" INTEGER NOT NULL,
    CONSTRAINT "StrategyTrade_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyMetric" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "strategyVersionId" INTEGER NOT NULL,
    "botName" TEXT NOT NULL,
    "trades" INTEGER NOT NULL,
    "grossPnl" REAL NOT NULL,
    "netPnl" REAL NOT NULL,
    "winRate" REAL NOT NULL,
    "sharpe" REAL NOT NULL,
    "maxDrawdown" REAL NOT NULL,
    CONSTRAINT "DailyMetric_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StrategyVersion_hash_key" ON "StrategyVersion"("hash");

-- CreateIndex
CREATE INDEX "StrategyTrade_symbol_ts_idx" ON "StrategyTrade"("symbol", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMetric_date_key" ON "DailyMetric"("date");
