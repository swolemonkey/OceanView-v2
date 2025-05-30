# Historical Replay Engine

This system replays historical market data through the AssetAgent pipeline to generate training data for the Gatekeeper model.

## Data Collection

### BTC/USD (5-minute bars)
```
curl -s \
  "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=90&interval=5m" \
  | jq -r '.prices[] | @csv' > data/btc_5m.csv
```

### AAPL (5-minute bars via Alpaca Data v2)
```
curl -H "APCA-API-KEY-ID:$KEY" \
     -H "APCA-API-SECRET-KEY:$SECRET" \
     "https://data.alpaca.markets/v2/stocks/AAPL/bars?start=$(date -u -v-90d +%FT%TZ)&timeframe=5Minute" \
  | jq -r '.bars[] | [.t,.o,.h,.l,.c] | @csv' > data/aapl_5m.csv
```

## Running the Replay

To run the historical replay:

```
pnpm ts-node scripts/replay_historical.ts
```

This will process the CSV files in the `data/` directory and replay them through the AssetAgent pipeline, generating labeled trade data for the Gatekeeper model.

## Verification

After running the replay, verify that sufficient data was generated:

```
pnpm prisma studio   # Verify RLDataset has > 500 rows
```

## Exporting the Dataset

To export the generated dataset for model training:

```
pnpm ts-node scripts/export_rl_dataset.ts
```

This will create `ml/data_export.csv` which can be used to train the Gatekeeper model.

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