-- AlterTable
ALTER TABLE "OrderBookMetric" ADD COLUMN "askVol" REAL;
ALTER TABLE "OrderBookMetric" ADD COLUMN "bidVol" REAL;

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

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HyperSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "smcThresh" REAL NOT NULL DEFAULT 0.002,
    "rsiOS" REAL NOT NULL DEFAULT 35,
    "rsiOB" REAL NOT NULL DEFAULT 65,
    "riskPct" REAL NOT NULL DEFAULT 1,
    "symbols" TEXT NOT NULL DEFAULT 'bitcoin',
    "atrMultiple" REAL NOT NULL DEFAULT 1.5,
    "atrPeriod" INTEGER NOT NULL DEFAULT 14,
    "gatekeeperThresh" REAL NOT NULL DEFAULT 0.55,
    "maxDailyLoss" REAL NOT NULL DEFAULT 0.03,
    "maxOpenRisk" REAL NOT NULL DEFAULT 0.05,
    "fastMAPeriod" INTEGER NOT NULL DEFAULT 50,
    "slowMAPeriod" INTEGER NOT NULL DEFAULT 200,
    "updatedAt" DATETIME NOT NULL,
    "strategyParams" TEXT NOT NULL DEFAULT '{}',
    "strategyToggle" TEXT NOT NULL DEFAULT '{"TrendFollowMA":true,"RangeBounce":true}',
    "smcMinRetrace" REAL NOT NULL DEFAULT 0.5
);
INSERT INTO "new_HyperSettings" ("atrMultiple", "atrPeriod", "fastMAPeriod", "gatekeeperThresh", "id", "maxDailyLoss", "maxOpenRisk", "riskPct", "rsiOS", "slowMAPeriod", "smcThresh", "symbols", "updatedAt") SELECT "atrMultiple", "atrPeriod", "fastMAPeriod", "gatekeeperThresh", "id", "maxDailyLoss", "maxOpenRisk", "riskPct", "rsiOS", "slowMAPeriod", "smcThresh", "symbols", "updatedAt" FROM "HyperSettings";
DROP TABLE "HyperSettings";
ALTER TABLE "new_HyperSettings" RENAME TO "HyperSettings";
CREATE TABLE "new_RLDataset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "symbol" TEXT NOT NULL,
    "featureVec" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "outcome" REAL NOT NULL,
    "strategyVersionId" INTEGER,
    "gateScore" REAL,
    "modelId" INTEGER,
    CONSTRAINT "RLDataset_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "RLModel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RLDataset" ("action", "featureVec", "id", "outcome", "strategyVersionId", "symbol", "ts") SELECT "action", "featureVec", "id", "outcome", "strategyVersionId", "symbol", "ts" FROM "RLDataset";
DROP TABLE "RLDataset";
ALTER TABLE "new_RLDataset" RENAME TO "RLDataset";
CREATE INDEX "RLDataset_symbol_ts_idx" ON "RLDataset"("symbol", "ts");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
