/*
  Warnings:

  - You are about to drop the `price1m` table. If the table is not empty, all the data it contains will be lost.

*/
-- Create temporary table to save existing data
CREATE TABLE "price1m_backup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "ts" DATETIME NOT NULL,
    "usd" DECIMAL NOT NULL
);

-- Copy data to backup
INSERT INTO "price1m_backup" SELECT * FROM "price1m";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "price1m";
PRAGMA foreign_keys=on;

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

-- Copy data from backup to new table with OHLCV structure
-- Use the usd value for open, high, low, close and set volume to 0
INSERT INTO "Price1m" (id, symbol, timestamp, open, high, low, close, volume)
SELECT id, symbol, ts, usd, usd, usd, usd, 0
FROM "price1m_backup";

-- Drop the backup table
DROP TABLE "price1m_backup";

-- CreateIndex
CREATE INDEX "Price1m_symbol_timestamp_idx" ON "Price1m"("symbol", "timestamp");
