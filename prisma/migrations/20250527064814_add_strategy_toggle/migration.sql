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
    "updatedAt" DATETIME NOT NULL,
    "strategyToggle" TEXT DEFAULT '{}'
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

-- CreateTable
CREATE TABLE "PortfolioMetric" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "equityStart" REAL NOT NULL,
    "equityEnd" REAL NOT NULL,
    "dailyPnl" REAL NOT NULL,
    "maxOpenRisk" REAL NOT NULL,
    "maxDrawdown" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "RLModel" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "version" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RLDataset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "featureVec" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "outcome" REAL NOT NULL,
    "gateScore" REAL,
    "strategyVersionId" INTEGER,
    "modelId" INTEGER,
    CONSTRAINT "RLDataset_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "RLModel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "equity" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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

-- CreateIndex
CREATE UNIQUE INDEX "StrategyVersion_hash_key" ON "StrategyVersion"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioMetric_date_key" ON "PortfolioMetric"("date");

-- CreateIndex
CREATE UNIQUE INDEX "RLModel_version_key" ON "RLModel"("version");
