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

-- Add botId and externalId columns to Order and Trade tables
ALTER TABLE "Order" ADD COLUMN "botId" INTEGER;
ALTER TABLE "Order" ADD COLUMN "type" TEXT DEFAULT 'market';

ALTER TABLE "Trade" ADD COLUMN "botId" INTEGER;
ALTER TABLE "Trade" ADD COLUMN "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SymbolRegistry_symbol_key" ON "SymbolRegistry"("symbol");

-- Add default symbols
INSERT INTO "SymbolRegistry" ("symbol", "assetClass", "exchange", "active", "updatedAt") 
VALUES 
  ('BTC', 'crypto', 'binance', true, CURRENT_TIMESTAMP),
  ('ETH', 'crypto', 'binance', true, CURRENT_TIMESTAMP),
  ('SOL', 'crypto', 'binance', true, CURRENT_TIMESTAMP),
  ('AAPL', 'equity', 'nasdaq', true, CURRENT_TIMESTAMP),
  ('MSFT', 'equity', 'nasdaq', true, CURRENT_TIMESTAMP),
  ('AMZN', 'equity', 'nasdaq', true, CURRENT_TIMESTAMP),
  ('GOOG', 'equity', 'nasdaq', true, CURRENT_TIMESTAMP),
  ('TSLA', 'equity', 'nasdaq', true, CURRENT_TIMESTAMP); 