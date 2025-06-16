# Historical Replay Engine

This system replays historical market data through the AssetAgent pipeline to generate training data for the Gatekeeper model.

## Automated Data Collection and Replay

The easiest way to collect data and run the replay is to use the provided script:

```bash
# Make the script executable
chmod +x scripts/download_and_replay.sh

# Run the data collection and replay
./scripts/download_and_replay.sh
```

This script will:
1. Try to use Polygon.io for both BTC and AAPL data (recommended)
2. Fall back to other APIs if Polygon.io is unavailable (CoinGecko, Alpha Vantage, Yahoo Finance)
3. Generate sample data as a last resort if all APIs fail
4. Run the historical replay process
5. Export the training dataset to ml/data_export.csv

### Setting up API keys

For best results with real market data, set up Polygon.io API key before running:

```bash
# Create a .env file
touch .env

# Add your Polygon.io API key to the .env file
echo "POLYGON_API_KEY=your_polygon_api_key_here" >> .env

# Load the environment variables
source .env

# Run the script
./scripts/download_and_replay.sh
```

Alternatively, you can set the environment variable directly:

```bash
# For Polygon.io (recommended, provides both stocks and crypto data)
export POLYGON_API_KEY=your_polygon_api_key_here

# For Alpha Vantage (stocks data, alternative)
export ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key_here

# For CoinGecko Pro (crypto data, alternative)
export COINGECKO_API_KEY=your_coingecko_api_key_here
```

## Manual Data Collection

If you prefer to collect data manually, you can use the following methods:

### BTC/USD (5-minute bars via Polygon.io)
```bash
# Replace YOUR_API_KEY with your Polygon.io API key
curl -s "https://api.polygon.io/v2/aggs/ticker/X:BTCUSD/range/5/minute/2023-01-01/2023-01-31?apiKey=YOUR_API_KEY" | jq -r '.results[] | [.t, .c] | @csv' > data/btc_5m.csv
```

### AAPL (5-minute bars via Polygon.io)
```bash
# Replace YOUR_API_KEY with your Polygon.io API key
curl -s "https://api.polygon.io/v2/aggs/ticker/AAPL/range/5/minute/2023-01-01/2023-01-31?apiKey=YOUR_API_KEY" | jq -r '.results[] | [.t, .o, .h, .l, .c] | @csv' > data/aapl_5m.csv
```

### Alternative APIs

#### BTC/USD (5-minute bars via CoinGecko)
```
curl -s \
  "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=90&interval=5m" \
  | jq -r '.prices[] | @csv' > data/btc_5m.csv
```

#### AAPL (5-minute bars via Alpaca Data v2)
```
curl -H "APCA-API-KEY-ID:$KEY" \
     -H "APCA-API-SECRET-KEY:$SECRET" \
     "https://data.alpaca.markets/v2/stocks/AAPL/bars?start=$(date -u -v-90d +%FT%TZ)&timeframe=5Minute" \
  | jq -r '.bars[] | [.t,.o,.h,.l,.c] | @csv' > data/aapl_5m.csv
```

## Running the Replay

To run the historical replay:

```
node scripts/replay_historical.js
```

This will process the CSV files in the `data/` directory and replay them through the AssetAgent pipeline, generating labeled trade data for the Gatekeeper model.

## Verification

After running the replay, verify that data was generated:

```
cat ml/data_export.csv  # Verify file has >500 rows
```

## Training the Gatekeeper Model

After exporting the dataset, use the Jupyter notebook to train a new logistic model:

```
# Navigate to the ml directory
cd ml

# Run the Jupyter notebook
jupyter notebook train_gatekeeper.ipynb
```

This will generate a new ONNX model file: `ml/gatekeeper_v2.onnx`

## Registering the New Model

To register the new model in the database:

```sql
insert into "RLModel"(version,path,description)
values('gatekeeper_v2','ml/gatekeeper_v2.onnx','Replay-augmented');
```

## CI Integration

A GitHub Actions workflow (`replay-test.yml`) is set up to run the replay on a small sample dataset to ensure it doesn't crash in the CI environment. 
