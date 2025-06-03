#!/bin/bash

# This script demonstrates the ONNX model promotion process
# It registers and promotes gatekeeper_v2.onnx to be the active model

set -e

echo "========== ONNX Model Promotion =========="
echo "1. Registering gatekeeper_v2.onnx"

# First register the v2 model
pnpm tsx packages/server/src/scripts/onnx-promotion.ts register \
  -p "ml/gatekeeper_v2.onnx" \
  -n "Replay-augmented model for prod"

# Show list of models
echo ""
echo "2. Current model listing:"
pnpm tsx packages/server/src/scripts/onnx-promotion.ts list

# Get the version ID of the newly registered model
# In a real scenario, you'd use the version ID from the registration output
VERSION=$(pnpm tsx packages/server/src/scripts/onnx-promotion.ts list | grep "gatekeeper_v2.onnx" | awk '{print $3}')

echo ""
echo "3. Promoting model with version: $VERSION"
pnpm tsx packages/server/src/scripts/onnx-promotion.ts promote -v "$VERSION"

echo ""
echo "4. Final model listing after promotion:"
pnpm tsx packages/server/src/scripts/onnx-promotion.ts list

echo ""
echo "5. Active model:"
pnpm tsx packages/server/src/scripts/onnx-promotion.ts active

echo ""
echo "========== Promotion Complete =========="
echo "The server will now use gatekeeper_v2.onnx on next restart" 