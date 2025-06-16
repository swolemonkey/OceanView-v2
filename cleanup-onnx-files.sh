#!/bin/bash

# This script cleans up ONNX model files in the ml directory
# It removes old naming convention files and ensures only the active model and recent versions remain

set -e

echo "========== ONNX Model Cleanup =========="

echo "1. Checking current active model..."
if [ -f "ml/gatekeeper_active.onnx" ]; then
  echo "✅ Active model exists: ml/gatekeeper_active.onnx"
  ls -la ml/gatekeeper_active.onnx
else
  echo "❌ Active model not found: ml/gatekeeper_active.onnx"
fi

echo ""
echo "2. Removing old naming convention files..."

# Remove the old primary and v1/v2 files if they exist
for old_file in ml/gatekeeper_primary*.onnx ml/gatekeeper_v1.onnx ml/gatekeeper_v2.onnx; do
  if [ -f "$old_file" ]; then
    echo "Removing old file: $old_file"
    rm "$old_file"
  fi
done

echo ""
echo "3. Cleaning up old versioned files (keeping last 5)..."

# Keep only the 5 most recent versioned files
ls -t ml/gatekeeper_v*.onnx 2>/dev/null | tail -n +6 | while read old_version; do
  echo "Removing old version: $old_version"
  rm "$old_version"
done

echo ""
echo "4. Current ONNX files in ml directory:"
ls -la ml/*.onnx 2>/dev/null || echo "No ONNX files found"

echo ""
echo "========== Cleanup Complete =========="
echo "The ml directory now contains:"
echo "- gatekeeper_active.onnx (the current active model)"
echo "- Up to 5 recent versioned models (gatekeeper_v*.onnx)"
echo "- gatekeeper_active_backup.onnx (if it exists)" 