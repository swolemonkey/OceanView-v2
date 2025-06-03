/*
  Warnings:

  - You are about to drop the `Price1m` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Price1m";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "price1m" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "ts" DATETIME NOT NULL,
    "usd" DECIMAL NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "price1m_symbol_ts_key" ON "price1m"("symbol", "ts");
