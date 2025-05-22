#!/bin/bash

# Start the UI server in the background
serve packages/ui/dist --single -l 5173 --listen 0.0.0.0 &
UI_PID=$!

# Start the backend server in the foreground
HOST=0.0.0.0 PORT=3334 pnpm --filter server run dev

# If the backend server exits, kill the UI server
kill $UI_PID 