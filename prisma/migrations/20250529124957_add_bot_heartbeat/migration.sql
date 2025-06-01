/*
  Warnings:

  - You are about to drop the column `strategyToggle` on the `HyperSettings` table. All the data in the column will be lost.

*/
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
    "updatedAt" DATETIME NOT NULL,
    "strategyParams" TEXT NOT NULL DEFAULT '{}'
);
INSERT INTO "new_HyperSettings" ("id", "riskPct", "rsiOB", "rsiOS", "smcMinRetrace", "smcThresh", "strategyParams", "symbols", "updatedAt") SELECT "id", "riskPct", "rsiOB", "rsiOS", "smcMinRetrace", "smcThresh", "strategyParams", "symbols", "updatedAt" FROM "HyperSettings";
DROP TABLE "HyperSettings";
ALTER TABLE "new_HyperSettings" RENAME TO "HyperSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
