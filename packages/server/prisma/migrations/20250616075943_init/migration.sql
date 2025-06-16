-- CreateTable
CREATE TABLE "Price1m" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(65,30) NOT NULL,
    "high" DECIMAL(65,30) NOT NULL,
    "low" DECIMAL(65,30) NOT NULL,
    "close" DECIMAL(65,30) NOT NULL,
    "volume" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "Price1m_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "qty" DECIMAL(65,30) NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'filled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL DEFAULT 'market',
    "exchangeOrderId" TEXT,
    "botId" INTEGER,
    "exchange" TEXT,
    "clientOrderId" TEXT,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "qty" DECIMAL(65,30) NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "feePaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pnl" DECIMAL(65,30),
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "botId" INTEGER,
    "fee" DECIMAL(65,30),
    "externalId" TEXT,
    "strategy" TEXT,
    "exchangeTradeId" TEXT,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bot" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'scalper',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "equity" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "pnlToday" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "parentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Metric" (
    "id" SERIAL NOT NULL,
    "botId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "equity" DOUBLE PRECISION NOT NULL,
    "pnl" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyVersion" (
    "id" SERIAL NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,

    CONSTRAINT "StrategyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyTrade" (
    "id" SERIAL NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "botName" TEXT NOT NULL,
    "strategyVersionId" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "size" DOUBLE PRECISION NOT NULL,
    "entryReason" TEXT NOT NULL,
    "exitReason" TEXT,
    "pnl" DOUBLE PRECISION NOT NULL,
    "durationMs" INTEGER NOT NULL,

    CONSTRAINT "StrategyTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMetric" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "strategyVersionId" INTEGER NOT NULL,
    "botName" TEXT NOT NULL,
    "symbol" TEXT NOT NULL DEFAULT '',
    "trades" INTEGER NOT NULL,
    "grossPnl" DOUBLE PRECISION NOT NULL,
    "netPnl" DOUBLE PRECISION NOT NULL,
    "winRate" DOUBLE PRECISION NOT NULL,
    "sharpe" DOUBLE PRECISION NOT NULL,
    "maxDrawdown" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HyperSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "smcThresh" DOUBLE PRECISION NOT NULL DEFAULT 0.002,
    "rsiOS" DOUBLE PRECISION NOT NULL DEFAULT 35,
    "rsiOB" DOUBLE PRECISION NOT NULL DEFAULT 65,
    "riskPct" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "symbols" TEXT NOT NULL DEFAULT 'bitcoin',
    "atrMultiple" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "atrPeriod" INTEGER NOT NULL DEFAULT 14,
    "gatekeeperThresh" DOUBLE PRECISION NOT NULL DEFAULT 0.55,
    "maxDailyLoss" DOUBLE PRECISION NOT NULL DEFAULT 0.03,
    "maxOpenRisk" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "fastMAPeriod" INTEGER NOT NULL DEFAULT 50,
    "slowMAPeriod" INTEGER NOT NULL DEFAULT 200,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "strategyParams" TEXT NOT NULL DEFAULT '{}',
    "strategyToggle" TEXT NOT NULL DEFAULT '{"TrendFollowMA":true,"RangeBounce":true}',
    "smcMinRetrace" DOUBLE PRECISION NOT NULL DEFAULT 0.5,

    CONSTRAINT "HyperSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioMetric" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "equityStart" DOUBLE PRECISION NOT NULL,
    "equityEnd" DOUBLE PRECISION NOT NULL,
    "dailyPnl" DOUBLE PRECISION NOT NULL,
    "maxOpenRisk" DOUBLE PRECISION NOT NULL,
    "maxDrawdown" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PortfolioMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RLModel" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "RLModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RLDataset" (
    "id" SERIAL NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "symbol" TEXT NOT NULL,
    "featureVec" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "outcome" DOUBLE PRECISION NOT NULL,
    "strategyVersionId" INTEGER,
    "gateScore" DOUBLE PRECISION,
    "modelId" INTEGER,

    CONSTRAINT "RLDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountState" (
    "id" SERIAL NOT NULL,
    "equity" DOUBLE PRECISION NOT NULL,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotHeartbeat" (
    "id" SERIAL NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "details" TEXT,

    CONSTRAINT "BotHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsSentiment" (
    "id" SERIAL NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "articles" INTEGER NOT NULL,

    CONSTRAINT "NewsSentiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderBookMetric" (
    "id" SERIAL NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "symbol" TEXT NOT NULL,
    "imbalance" DOUBLE PRECISION NOT NULL,
    "depth" INTEGER NOT NULL,
    "bidVol" DOUBLE PRECISION,
    "askVol" DOUBLE PRECISION,

    CONSTRAINT "OrderBookMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SymbolRegistry" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "exchange" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SymbolRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvolutionMetric" (
    "id" SERIAL NOT NULL,
    "parentId" INTEGER NOT NULL,
    "childId" INTEGER NOT NULL,
    "sharpe" DOUBLE PRECISION NOT NULL,
    "drawdown" DOUBLE PRECISION NOT NULL,
    "promoted" BOOLEAN NOT NULL DEFAULT false,
    "childParams" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvolutionMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experience" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "smcThresh" DOUBLE PRECISION NOT NULL,
    "rsiOS" DOUBLE PRECISION NOT NULL,
    "reward" DOUBLE PRECISION NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Experience_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Price1m_symbol_timestamp_idx" ON "Price1m"("symbol", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Price1m_symbol_timestamp_key" ON "Price1m"("symbol", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Bot_name_key" ON "Bot"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyVersion_hash_key" ON "StrategyVersion"("hash");

-- CreateIndex
CREATE INDEX "StrategyTrade_symbol_ts_idx" ON "StrategyTrade"("symbol", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMetric_date_symbol_strategyVersionId_key" ON "DailyMetric"("date", "symbol", "strategyVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioMetric_date_key" ON "PortfolioMetric"("date");

-- CreateIndex
CREATE UNIQUE INDEX "RLModel_version_key" ON "RLModel"("version");

-- CreateIndex
CREATE INDEX "RLDataset_symbol_ts_idx" ON "RLDataset"("symbol", "ts");

-- CreateIndex
CREATE INDEX "NewsSentiment_ts_idx" ON "NewsSentiment"("ts");

-- CreateIndex
CREATE INDEX "OrderBookMetric_symbol_ts_idx" ON "OrderBookMetric"("symbol", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "SymbolRegistry_symbol_key" ON "SymbolRegistry"("symbol");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metric" ADD CONSTRAINT "Metric_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyTrade" ADD CONSTRAINT "StrategyTrade_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyMetric" ADD CONSTRAINT "DailyMetric_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RLDataset" ADD CONSTRAINT "RLDataset_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "RLModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
