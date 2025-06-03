#!/bin/bash

# This script syncs ONNX model files between the root ml directory 
# and the packages/server/ml directory to ensure the server can find them

set -e

echo "========== ONNX Model Sync =========="

# Make sure the server ml directory exists
mkdir -p packages/server/ml

# Copy all ONNX files from root ml to server ml
echo "Copying ONNX models from ml/ to packages/server/ml/"
cp ml/*.onnx packages/server/ml/

# Count files
ROOT_COUNT=$(ls ml/*.onnx | wc -l)
SERVER_COUNT=$(ls packages/server/ml/*.onnx | wc -l)

echo "Root ml directory: $ROOT_COUNT model files"
echo "Server ml directory: $SERVER_COUNT model files"

echo ""
echo "========== Sync Complete =========="
echo "The server should now be able to find all model files." 