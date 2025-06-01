-- CreateTable
CREATE TABLE "Bot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'hypertrades',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "parentId" INTEGER,
    "equity" REAL NOT NULL DEFAULT 10000,
    "pnlToday" REAL NOT NULL DEFAULT 0,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Metric" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "botId" INTEGER NOT NULL,
    "equity" REAL NOT NULL,
    "pnl" REAL NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EvolutionMetric" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "parentId" INTEGER NOT NULL,
    "childId" INTEGER NOT NULL,
    "sharpe" REAL NOT NULL,
    "drawdown" REAL NOT NULL,
    "promoted" BOOLEAN NOT NULL DEFAULT false,
    "childParams" TEXT NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "NewsSentiment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OrderBookMetric" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "bidVol" REAL NOT NULL,
    "askVol" REAL NOT NULL,
    "imbalance" REAL NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BotHeartbeat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "details" TEXT
);

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

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HyperSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "smcThresh" REAL NOT NULL DEFAULT 0.002,
    "rsiOS" REAL NOT NULL DEFAULT 35,
    "rsiOB" REAL NOT NULL DEFAULT 65,
    "symbols" TEXT NOT NULL DEFAULT 'bitcoin',
    "riskPct" REAL NOT NULL DEFAULT 1,
    "smcMinRetrace" REAL NOT NULL DEFAULT 0.5,
    "maxDailyLoss" REAL NOT NULL DEFAULT 0.03,
    "maxOpenRisk" REAL NOT NULL DEFAULT 0.05,
    "gatekeeperThresh" REAL NOT NULL DEFAULT 0.55,
    "atrMultiple" REAL NOT NULL DEFAULT 1.5,
    "atrPeriod" INTEGER NOT NULL DEFAULT 14,
    "updatedAt" DATETIME NOT NULL,
    "strategyParams" TEXT NOT NULL DEFAULT '{}',
    "strategyToggle" TEXT NOT NULL DEFAULT '{"TrendFollowMA":true,"RangeBounce":true}'
);
INSERT INTO "new_HyperSettings" ("id", "riskPct", "rsiOB", "rsiOS", "smcMinRetrace", "smcThresh", "strategyToggle", "symbols", "updatedAt") SELECT "id", "riskPct", "rsiOB", "rsiOS", "smcMinRetrace", "smcThresh", coalesce("strategyToggle", '{"TrendFollowMA":true,"RangeBounce":true}') AS "strategyToggle", "symbols", "updatedAt" FROM "HyperSettings";
DROP TABLE "HyperSettings";
ALTER TABLE "new_HyperSettings" RENAME TO "HyperSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "RLDataset_symbol_ts_idx" ON "RLDataset"("symbol", "ts");
