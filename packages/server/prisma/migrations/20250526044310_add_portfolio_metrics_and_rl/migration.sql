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

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioMetric_date_key" ON "PortfolioMetric"("date");

-- CreateIndex
CREATE UNIQUE INDEX "RLModel_version_key" ON "RLModel"("version");
