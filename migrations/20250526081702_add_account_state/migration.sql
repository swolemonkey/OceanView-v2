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

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioMetric_date_key" ON "PortfolioMetric"("date");

-- CreateIndex
CREATE UNIQUE INDEX "RLModel_version_key" ON "RLModel"("version");
