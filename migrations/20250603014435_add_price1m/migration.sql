-- CreateTable
CREATE TABLE "price1m" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ts" DATETIME NOT NULL,
    "symbol" TEXT NOT NULL,
    "usd" REAL NOT NULL
);

-- CreateIndex
CREATE INDEX "price1m_symbol_ts_idx" ON "price1m"("symbol", "ts");
