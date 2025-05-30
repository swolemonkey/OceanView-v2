#!/bin/bash
# ==============================================================================
# Historical Market Data Downloader and Replay Engine
# ==============================================================================
# 
# This script:
# 1. Downloads historical market data from public APIs
# 2. Processes the data through the replay engine
# 3. Generates training data for the ML model
#
# API KEYS:
# ---------
# To use real data sources, set these environment variables:
#
# For Polygon.io (preferred, stocks & crypto):
#   export POLYGON_API_KEY=your_api_key_here
#   Get a key at: https://polygon.io/dashboard/signup
#
# For Alpha Vantage (stocks):
#   export ALPHA_VANTAGE_API_KEY=your_api_key_here
#   Get a free key at: https://www.alphavantage.co/support/#api-key
#
# For CoinGecko Pro (crypto):
#   export COINGECKO_API_KEY=your_api_key_here  
#   For higher rate limits: https://www.coingecko.com/en/api/pricing
#
# If API keys are not set or rate limits are reached, the script
# will fall back to generating sample data.
# ==============================================================================

set -e

# Create data directory if it doesn't exist
mkdir -p data
mkdir -p ml

# Helper function for API retries with exponential backoff
function retry_api_call() {
  local max_attempts=3
  local timeout=5
  local attempt=1
  local exit_code=0

  while [[ $attempt -le $max_attempts ]]; do
    echo "API request attempt $attempt of $max_attempts..."
    "$@"
    exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
      break
    fi

    echo "Attempt $attempt failed! Waiting $timeout seconds..."
    sleep $timeout
    attempt=$((attempt + 1))
    timeout=$((timeout * 2))
  done

  return $exit_code
}

# First try Polygon.io if API key is available
if [[ -n "$POLYGON_API_KEY" ]]; then
  echo "Polygon.io API key detected, using Polygon for data..."
  
  # Get BTC data from Polygon
  echo "Downloading BTC/USD data from Polygon.io..."
  START_DATE=$(date -v-7d +%s000)  # 7 days ago in milliseconds
  END_DATE=$(date +%s000)          # Today in milliseconds
  
  # Create BTC CSV file directly
  rm -f data/btc_5m.csv
  touch data/btc_5m.csv
  
  # Direct CSV extraction for BTC
  if curl -s "https://api.polygon.io/v2/aggs/ticker/X:BTCUSD/range/5/minute/$START_DATE/$END_DATE?apiKey=${POLYGON_API_KEY}&limit=5000" | jq -r '.results[]? | [.t, .c] | @csv' >> data/btc_5m.csv; then
    # Check if we got any data rows
    if [[ -s data/btc_5m.csv ]] && [[ $(wc -l < data/btc_5m.csv) -gt 0 ]]; then
      echo "Created $(wc -l < data/btc_5m.csv) BTC/USD bars from Polygon.io"
      POLYGON_BTC_SUCCESS=true
    else
      echo "No data rows found in Polygon response for BTC"
      POLYGON_BTC_SUCCESS=false
    fi
  else
    echo "Failed to get valid BTC data from Polygon.io"
    POLYGON_BTC_SUCCESS=false
  fi
  
  # Get AAPL data from Polygon
  echo "Downloading AAPL data from Polygon.io..."
  
  # Create AAPL CSV file directly
  rm -f data/aapl_5m.csv
  touch data/aapl_5m.csv
  
  # Direct CSV extraction for AAPL
  if curl -s "https://api.polygon.io/v2/aggs/ticker/AAPL/range/5/minute/$START_DATE/$END_DATE?apiKey=${POLYGON_API_KEY}&limit=5000" | jq -r '.results[]? | [.t, .o, .h, .l, .c] | @csv' >> data/aapl_5m.csv; then
    # Check if we got any data rows
    if [[ -s data/aapl_5m.csv ]] && [[ $(wc -l < data/aapl_5m.csv) -gt 0 ]]; then
      echo "Created $(wc -l < data/aapl_5m.csv) AAPL bars from Polygon.io"
      POLYGON_AAPL_SUCCESS=true
    else
      echo "No data rows found in Polygon response for AAPL"
      POLYGON_AAPL_SUCCESS=false
    fi
  else
    echo "Failed to get valid AAPL data from Polygon.io"
    POLYGON_AAPL_SUCCESS=false
  fi
else
  echo "No Polygon.io API key found, falling back to other sources"
  POLYGON_BTC_SUCCESS=false
  POLYGON_AAPL_SUCCESS=false
fi

# Try other sources if Polygon didn't work for BTC
if [[ "$POLYGON_BTC_SUCCESS" != "true" ]]; then
  echo "Downloading BTC/USD 5-minute bars from CoinGecko API..."
  # Use CoinGecko API to fetch historical data for Bitcoin
  BTC_START_DATE=$(date -v-4d +%s)  # 4 days ago
  BTC_END_DATE=$(date +%s)          # Now

  # Try to download data from CoinGecko
  echo "Fetching BTC data from CoinGecko API..."
  retry_api_call curl -s "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range?vs_currency=usd&from=${BTC_START_DATE}&to=${BTC_END_DATE}" -H "accept: application/json" > data/btc_temp.json

  # Check if we got valid JSON data with prices array
  if grep -q "\"prices\"" data/btc_temp.json && ! grep -q "Too Many Requests" data/btc_temp.json; then
    echo "Processing BTC price data..."
    # Extract prices array from the JSON and format as CSV
    jq -r '.prices[] | [.[0], .[1]] | @csv' data/btc_temp.json > data/btc_5m.csv
    
    # Check if we actually got data rows
    if [[ -s data/btc_5m.csv ]] && [[ $(wc -l < data/btc_5m.csv) -gt 0 ]]; then
      echo "Created $(wc -l < data/btc_5m.csv) BTC/USD bars from CoinGecko"
      COINGECKO_SUCCESS=true
    else
      echo "No data rows found in CoinGecko response, falling back to sample data..."
      # Generate fallback data (see below)
      rm -f data/btc_5m.csv
      COINGECKO_SUCCESS=false
    fi
  else
    echo "Failed to get valid data from CoinGecko API, falling back to sample data..."
    COINGECKO_SUCCESS=false
  fi
fi

# Create sample BTC data if all APIs failed
if [[ "$POLYGON_BTC_SUCCESS" != "true" && "$COINGECKO_SUCCESS" != "true" || ! -f data/btc_5m.csv ]]; then
  echo "All API attempts failed, falling back to sample data for BTC..."
  # Generate 1000 rows of sample data as fallback
  CURRENT_TIME=$(date +%s000)
  rm -f data/btc_5m.csv
  for i in {0..999}; do
    TIMESTAMP=$((CURRENT_TIME - i * 300000))
    PRICE=$((95000 + RANDOM % 5000))
    echo "$TIMESTAMP,$PRICE" >> data/btc_5m.csv
  done
  echo "Created $(wc -l < data/btc_5m.csv) BTC/USD sample bars as fallback"
fi

# Try other sources if Polygon didn't work for AAPL
if [[ "$POLYGON_AAPL_SUCCESS" != "true" ]]; then
  echo "Downloading AAPL 5-minute bars..."
  # First try Alpha Vantage for AAPL data
  if [[ -n "$ALPHA_VANTAGE_API_KEY" ]]; then
    echo "Fetching AAPL data from Alpha Vantage API..."
    retry_api_call curl -s "https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=AAPL&interval=5min&apikey=${ALPHA_VANTAGE_API_KEY}&outputsize=full" > data/aapl_temp.json
    
    # Check if we got valid JSON data
    if grep -q "\"Time Series (5min)\"" data/aapl_temp.json; then
      echo "Processing AAPL price data from Alpha Vantage..."
      # Convert Alpha Vantage JSON to CSV format with timestamp,open,high,low,close
      jq -r '.["Time Series (5min)"] | to_entries | map([(.key | split(" ") | .[0]+"T"+.[1]+"Z" | fromdateiso8601 * 1000 | tostring), .value["1. open"], .value["2. high"], .value["3. low"], .value["4. close"]] | join(",")) | .[]' data/aapl_temp.json > data/aapl_5m.csv
      echo "Created $(wc -l < data/aapl_5m.csv) AAPL bars from Alpha Vantage"
      ALPHA_VANTAGE_SUCCESS=true
    else
      echo "Failed to get valid data from Alpha Vantage API"
      ALPHA_VANTAGE_SUCCESS=false
    fi
  else
    echo "Alpha Vantage API key not set, skipping this source"
    ALPHA_VANTAGE_SUCCESS=false
  fi

  # If Alpha Vantage failed or not available, try Yahoo Finance
  if [[ "$ALPHA_VANTAGE_SUCCESS" != "true" ]]; then
    echo "Trying Yahoo Finance API for AAPL data..."
    # Use Yahoo Finance API to fetch historical data for Apple
    retry_api_call curl -s "https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=5m&range=4d" -H "accept: application/json" > data/aapl_temp.json
    
    # Check if we got valid JSON data
    if grep -q "\"chart\"" data/aapl_temp.json && ! grep -q "Too Many Requests" data/aapl_temp.json; then
      echo "Processing AAPL price data from Yahoo Finance..."
      # Extract OHLC data from Yahoo Finance JSON and format as CSV
      jq -r '.chart.result[0] | .timestamp as $timestamps | .indicators.quote[0] | [range(0;$timestamps|length)] | map($timestamps[.]*1000, .open[.], .high[.], .low[.], .close[.]) | .[] | @csv' data/aapl_temp.json > data/aapl_5m.csv
      echo "Created $(wc -l < data/aapl_5m.csv) AAPL bars from Yahoo Finance"
      YAHOO_SUCCESS=true
    else
      echo "Failed to get valid data from Yahoo Finance API"
      YAHOO_SUCCESS=false
    fi
  fi
fi

# If all APIs failed for AAPL, fall back to sample data
if [[ "$POLYGON_AAPL_SUCCESS" != "true" && "$ALPHA_VANTAGE_SUCCESS" != "true" && "$YAHOO_SUCCESS" != "true" || ! -f data/aapl_5m.csv ]]; then
  echo "All API attempts failed, falling back to sample data for AAPL..."
  # Generate 500 rows of sample data as fallback
  CURRENT_TIME=$(date +%s000)
  rm -f data/aapl_5m.csv
  for i in {0..499}; do
    TIMESTAMP=$((CURRENT_TIME - i * 300000))
    OPEN=$((170 + RANDOM % 10))
    HIGH=$((OPEN + RANDOM % 5))
    LOW=$((OPEN - RANDOM % 5))
    CLOSE=$((OPEN + RANDOM % 10 - 5))
    echo "$TIMESTAMP,$OPEN,$HIGH,$LOW,$CLOSE" >> data/aapl_5m.csv
  done
  echo "Created $(wc -l < data/aapl_5m.csv) AAPL sample bars as fallback"
fi

echo "Running historical replay..."
node scripts/replay_historical.js

echo "Dataset exported to ml/data_export.csv"
echo "Row count: $(wc -l < ml/data_export.csv)"

echo "Complete! Check ml/data_export.csv for the exported dataset."
echo "Next steps:"
echo "1. Train the model: cd ml && jupyter notebook train_gatekeeper.ipynb"
echo "2. Register the model: insert into \"RLModel\"(version,path,description) values('gatekeeper_v2','ml/gatekeeper_v2.onnx','Replay-augmented');" 