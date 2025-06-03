#!/bin/bash

# This script demonstrates the ONNX model promotion process
# It registers and promotes gatekeeper_v2.onnx to be the active model

set -e

echo "========== ONNX Model Promotion =========="
echo "1. First, let's update file paths to make sure they match actual files"
pnpm tsx packages/server/src/scripts/onnx-promotion.ts fix-paths

echo ""
echo "2. Registering gatekeeper_v2.onnx"

# Register the v2 model
RESULT=$(pnpm tsx packages/server/src/scripts/onnx-promotion.ts register \
  -p "ml/gatekeeper_v2.onnx" \
  -n "Replay-augmented model for prod")

# Extract the model ID from the registration output
MODEL_ID=$(echo "$RESULT" | grep "Successfully registered model with ID" | awk '{print $6}' | tr -d ',')

# Show list of models
echo ""
echo "3. Current model listing:"
pnpm tsx packages/server/src/scripts/onnx-promotion.ts list

echo ""
echo "4. Promoting model with ID: $MODEL_ID"
pnpm tsx packages/server/src/scripts/onnx-promotion.ts promote -i "$MODEL_ID"

echo ""
echo "5. Final model listing after promotion:"
pnpm tsx packages/server/src/scripts/onnx-promotion.ts list

echo ""
echo "6. Active model:"
pnpm tsx packages/server/src/scripts/onnx-promotion.ts active

echo ""
echo "========== Promotion Complete =========="
echo "The server will now use gatekeeper_v2.onnx on next restart"
echo "To restart the server, run: pm2 restart all" 