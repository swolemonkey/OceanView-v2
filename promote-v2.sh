#!/bin/bash

# This script demonstrates the ONNX model promotion process
# It registers and promotes gatekeeper_v2.onnx to be the active model

set -e

echo "========== ONNX Model Promotion =========="
echo "0. First, migrate existing models to the new naming convention"
pnpm tsx packages/server/src/scripts/onnx-promotion.ts migrate-naming

echo ""
echo "1. Registering gatekeeper_v2.onnx"

# First register the v2 model
REGISTER_OUTPUT=$(pnpm tsx packages/server/src/scripts/onnx-promotion.ts register \
  -p "ml/gatekeeper_v2.onnx" \
  -n "Replay-augmented model for prod")

echo "$REGISTER_OUTPUT"

# Extract the model ID from the registration output
MODEL_ID=$(echo "$REGISTER_OUTPUT" | grep "ID" | head -1 | awk '{print $NF}')

echo ""
echo "2. Current model listing:"
pnpm tsx packages/server/src/scripts/onnx-promotion.ts list

echo ""
echo "3. Promoting model with ID: $MODEL_ID"
pnpm tsx packages/server/src/scripts/onnx-promotion.ts promote -i "$MODEL_ID"

echo ""
echo "4. Final model listing after promotion:"
pnpm tsx packages/server/src/scripts/onnx-promotion.ts list

echo ""
echo "5. Active model:"
pnpm tsx packages/server/src/scripts/onnx-promotion.ts active

echo ""
echo "========== Promotion Complete =========="
echo "The server will now use the new primary model on next restart" 