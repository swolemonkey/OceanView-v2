-- CreateTable
CREATE TABLE "SymbolRegistry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "exchange" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "SymbolRegistry_symbol_key" ON "SymbolRegistry"("symbol");
