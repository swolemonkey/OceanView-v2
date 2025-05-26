#!/bin/bash
# Setup and train the RL gatekeeper model

echo "Step 1: Setting up Python virtual environment..."
cd ml
./setup_env.sh
source .venv/bin/activate

echo "Step 2: Exporting dataset from database..."
cd ..
pnpm ts-node scripts/export_rl_dataset.ts

echo "Step 3: Training model..."
cd ml
python train_gatekeeper.py

echo "Step 4: Registering model in database..."
cd ..
pnpm ts-node scripts/register_rl_model.ts

echo "Setup complete! Restart the service to activate the gatekeeper." 