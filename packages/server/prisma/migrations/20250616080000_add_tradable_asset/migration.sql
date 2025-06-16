-- CreateTable
CREATE TABLE "TradableAsset" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TradableAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TradableAsset_symbol_key" ON "TradableAsset"("symbol");
