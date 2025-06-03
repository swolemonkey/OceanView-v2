#!/bin/bash
# This script starts the server with a flag to use the v2 model
export USE_V2_MODEL=true
cd packages/server && pnpm run dev
