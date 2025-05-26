-- CreateTable
CREATE TABLE "Experience" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "smcThresh" REAL NOT NULL,
    "rsiOS" REAL NOT NULL,
    "reward" REAL NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "HyperSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "smcThresh" REAL NOT NULL DEFAULT 0.002,
    "rsiOS" REAL NOT NULL DEFAULT 35,
    "rsiOB" REAL NOT NULL DEFAULT 65,
    "symbols" TEXT NOT NULL DEFAULT 'bitcoin',
    "riskPct" REAL NOT NULL DEFAULT 1,
    "smcMinRetrace" REAL NOT NULL DEFAULT 0.5,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StrategyVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "hash" TEXT NOT NULL,
    "description" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "StrategyTrade" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "qty" REAL NOT NULL,
    "price" REAL NOT NULL,
    "fee" REAL NOT NULL DEFAULT 0,
    "pnl" REAL NOT NULL,
    "entryTs" DATETIME NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "botName" TEXT NOT NULL,
    "strategyVersionId" INTEGER NOT NULL,
    CONSTRAINT "StrategyTrade_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "daily_metrics" (
    "date" DATETIME NOT NULL,
    "symbol" TEXT NOT NULL,
    "strategyVersionId" INTEGER NOT NULL,
    "botName" TEXT NOT NULL,
    "trades" INTEGER NOT NULL,
    "grossPnl" REAL NOT NULL,
    "netPnl" REAL NOT NULL,
    "winRate" REAL NOT NULL,
    "sharpe" REAL NOT NULL,
    "maxDrawdown" REAL NOT NULL,

    PRIMARY KEY ("date", "symbol", "strategyVersionId"),
    CONSTRAINT "daily_metrics_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StrategyVersion_hash_key" ON "StrategyVersion"("hash");
