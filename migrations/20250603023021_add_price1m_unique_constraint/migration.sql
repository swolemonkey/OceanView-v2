/*
  Warnings:

  - A unique constraint covering the columns `[symbol,ts]` on the table `price1m` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "price1m_symbol_ts_key" ON "price1m"("symbol", "ts");
