#!/bin/bash
set -e

# Create data directory if it doesn't exist
mkdir -p data

echo "Downloading BTC/USD 5-minute bars (90 days)..."
curl -s \
  "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=90&interval=5m" \
  | jq -r '.prices[] | @csv' > data/btc_5m.csv

echo "Downloaded $(wc -l < data/btc_5m.csv) BTC/USD bars"

# Check if Alpaca API keys are set
if [ -z "$APCA_API_KEY_ID" ] || [ -z "$APCA_API_SECRET_KEY" ]; then
  echo "Alpaca API keys not set. Skipping AAPL download."
  echo "To download AAPL data, set the following environment variables:"
  echo "  export APCA_API_KEY_ID=your_api_key"
  echo "  export APCA_API_SECRET_KEY=your_api_secret"
else
  echo "Downloading AAPL 5-minute bars (90 days)..."
  curl -s -H "APCA-API-KEY-ID:$APCA_API_KEY_ID" \
       -H "APCA-API-SECRET-KEY:$APCA_API_SECRET_KEY" \
       "https://data.alpaca.markets/v2/stocks/AAPL/bars?start=$(date -u -v-90d +%FT%TZ)&timeframe=5Minute" \
    | jq -r '.bars[] | [.t,.o,.h,.l,.c] | @csv' > data/aapl_5m.csv
  
  echo "Downloaded $(wc -l < data/aapl_5m.csv) AAPL bars"
fi

echo "Running historical replay..."
pnpm ts-node scripts/replay_historical.ts

echo "Exporting dataset for model training..."
pnpm ts-node scripts/export_rl_dataset.ts

echo "Complete! Check ml/data_export.csv for the exported dataset."
echo "Next steps:"
echo "1. Train the model: cd ml && jupyter notebook train_gatekeeper.ipynb"
echo "2. Register the model: insert into \"RLModel\"(version,path,description) values('gatekeeper_v2','ml/gatekeeper_v2.onnx','Replay-augmented');" 