-- CreateTable
CREATE TABLE "Price1m" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "open" DECIMAL NOT NULL,
    "high" DECIMAL NOT NULL,
    "low" DECIMAL NOT NULL,
    "close" DECIMAL NOT NULL,
    "volume" DECIMAL NOT NULL
);

-- CreateTable
CREATE TABLE "Order" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "qty" DECIMAL NOT NULL,
    "price" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'filled',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "qty" DECIMAL NOT NULL,
    "price" DECIMAL NOT NULL,
    "feePaid" DECIMAL NOT NULL DEFAULT 0,
    "pnl" DECIMAL NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Trade_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'scalper',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "equity" REAL NOT NULL DEFAULT 10000,
    "pnlToday" REAL NOT NULL DEFAULT 0,
    "parentId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Metric" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "botId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "equity" REAL NOT NULL,
    "pnl" REAL NOT NULL,
    CONSTRAINT "Metric_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

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

-- CreateTable
CREATE TABLE "HyperSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "smcThresh" REAL NOT NULL DEFAULT 0.002,
    "rsiOS" REAL NOT NULL DEFAULT 35,
    "riskPct" REAL NOT NULL DEFAULT 1,
    "symbols" TEXT NOT NULL DEFAULT 'bitcoin',
    "atrMultiple" REAL NOT NULL DEFAULT 1.5,
    "atrPeriod" INTEGER NOT NULL DEFAULT 14,
    "gatekeeperThresh" REAL NOT NULL DEFAULT 0.55,
    "maxDailyLoss" REAL NOT NULL DEFAULT 0.03,
    "maxOpenRisk" REAL NOT NULL DEFAULT 0.05,
    "fastMAPeriod" INTEGER NOT NULL DEFAULT 50,
    "slowMAPeriod" INTEGER NOT NULL DEFAULT 200,
    "updatedAt" DATETIME NOT NULL
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "description" TEXT
);

-- CreateTable
CREATE TABLE "RLDataset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "symbol" TEXT NOT NULL,
    "featureVec" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "outcome" REAL NOT NULL,
    "strategyVersionId" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "AccountState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "equity" REAL NOT NULL,
    "updated" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BotHeartbeat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "details" TEXT
);

-- CreateTable
CREATE TABLE "NewsSentiment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "articles" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "OrderBookMetric" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "symbol" TEXT NOT NULL,
    "imbalance" REAL NOT NULL,
    "depth" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "SymbolRegistry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "exchange" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Price1m_symbol_timestamp_key" ON "Price1m"("symbol", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Bot_name_key" ON "Bot"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyVersion_hash_key" ON "StrategyVersion"("hash");

-- CreateIndex
CREATE INDEX "StrategyTrade_symbol_ts_idx" ON "StrategyTrade"("symbol", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMetric_date_key" ON "DailyMetric"("date");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioMetric_date_key" ON "PortfolioMetric"("date");

-- CreateIndex
CREATE UNIQUE INDEX "RLModel_version_key" ON "RLModel"("version");

-- CreateIndex
CREATE INDEX "NewsSentiment_ts_idx" ON "NewsSentiment"("ts");

-- CreateIndex
CREATE INDEX "OrderBookMetric_symbol_ts_idx" ON "OrderBookMetric"("symbol", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "SymbolRegistry_symbol_key" ON "SymbolRegistry"("symbol");
