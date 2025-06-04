/*
  Warnings:

  - A unique constraint covering the columns `[symbol,timestamp]` on the table `Price1m` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Price1m_symbol_timestamp_key" ON "Price1m"("symbol", "timestamp");
