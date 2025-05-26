#!/bin/bash
# Set up a Python virtual environment for the ML components

# Create virtual environment
python -m venv .venv

# Activate virtual environment
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file for VS Code
echo "PYTHONPATH=$(pwd)" > .env

echo "Virtual environment created and packages installed!"
echo "To activate the environment manually, run: source .venv/bin/activate"
echo "VS Code should automatically detect and use this environment." 