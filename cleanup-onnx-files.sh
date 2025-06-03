#!/bin/bash

# This script cleans up ONNX model files in the ml directory
# It removes old naming convention files and ensures only the active primary model remains

set -e

echo "========== ONNX Model Cleanup =========="

# First, let's check the current active model
echo "1. Checking current active model..."
ACTIVE_MODEL=$(pnpm tsx packages/server/src/scripts/onnx-promotion.ts active)
ACTIVE_ID=$(echo "$ACTIVE_MODEL" | grep "ID:" | awk '{print $2}')
ACTIVE_PATH=$(echo "$ACTIVE_MODEL" | grep "Path:" | awk '{print $2}')

echo "Active model ID: $ACTIVE_ID"
echo "Active model path: $ACTIVE_PATH"

echo ""
echo "2. Removing old naming convention files..."

# Remove the old v1 and v2 files if they exist
if [ -f "ml/gatekeeper_v1.onnx" ]; then
  echo "Removing ml/gatekeeper_v1.onnx"
  rm ml/gatekeeper_v1.onnx
fi

if [ -f "ml/gatekeeper_v2.onnx" ]; then
  echo "Removing ml/gatekeeper_v2.onnx"
  rm ml/gatekeeper_v2.onnx
fi

echo ""
echo "3. Removing unused primary files..."

# Keep only the current primary file, remove others with 'primary' in the name
for f in ml/gatekeeper_primary*.onnx; do
  if [ "$f" != "$ACTIVE_PATH" ]; then
    echo "Removing unused primary file: $f"
    rm "$f"
  fi
done

echo ""
echo "4. Current ONNX files in ml directory:"
ls -la ml/*.onnx

echo ""
echo "========== Cleanup Complete =========="
echo "The ml directory now contains only the necessary ONNX model files." 