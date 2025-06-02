-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HyperSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
INSERT INTO "new_HyperSettings" ("atrMultiple", "atrPeriod", "gatekeeperThresh", "id", "maxDailyLoss", "maxOpenRisk", "riskPct", "rsiOB", "rsiOS", "smcMinRetrace", "smcThresh", "strategyParams", "strategyToggle", "symbols", "updatedAt") SELECT "atrMultiple", "atrPeriod", "gatekeeperThresh", "id", "maxDailyLoss", "maxOpenRisk", "riskPct", "rsiOB", "rsiOS", "smcMinRetrace", "smcThresh", "strategyParams", "strategyToggle", "symbols", "updatedAt" FROM "HyperSettings";
DROP TABLE "HyperSettings";
ALTER TABLE "new_HyperSettings" RENAME TO "HyperSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
