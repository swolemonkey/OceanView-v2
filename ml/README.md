# RL Gatekeeper Implementation

This directory contains the machine learning models and training code for the reinforcement learning gatekeeper.

## Steps to Train and Activate Gatekeeper

### 1. Export Dataset

Run the export script to extract feature vectors and labels from the RLDataset table:

```bash
pnpm ts-node scripts/export_rl_dataset.ts
```

This will create `ml/data_export.csv` with the training data.

### 2. Set Up Python Environment

The project uses a Python virtual environment to isolate dependencies. Set it up with:

```bash
cd ml
./setup_env.sh
```

This will:
- Create a Python virtual environment in the `.venv` folder
- Activate the environment
- Install all required packages from `requirements.txt`:
  - numpy
  - pandas
  - scikit-learn
  - skl2onnx
  - onnx
  - onnxruntime

When opening the project in VS Code, it should automatically detect and use this environment. If you see import errors in VS Code, select the correct Python interpreter by pressing F1 → "Python: Select Interpreter" and choose the one in the `.venv` folder.

### 3. Train Model

You can train the model using either the Jupyter notebook or the Python script:

#### Option A: Using Jupyter Notebook

```bash
cd ml
jupyter notebook train_gatekeeper.ipynb
```

#### Option B: Using Python Script (Recommended)

```bash
cd ml
python train_gatekeeper.py
```

Either method will:
- Load the dataset
- Train a logistic regression model
- Evaluate performance (target ROC-AUC ≥ 0.6)
- Export the model to ONNX format as `gatekeeper_active.onnx`

### 4. Register Model

Run the model registration script:

```bash
pnpm ts-node scripts/register_rl_model.ts
```

This will:
- Add the model path to the RLModel table
- Initialize the AccountState with starting equity of 10,000

### 5. Restart Service

Restart the trading service to activate the gatekeeper:

```bash
pnpm run restart
```

The system will now:
- Load the ONNX model at startup
- Veto trades with scores below 0.55
- Log all trade decisions with gatekeeper scores
- Bootstrap equity from the database

## Model Management

The system uses a **stable active model approach**:

- **Active Model**: Always located at `ml/gatekeeper_active.onnx`
- **Versioned Models**: Historical models stored as `ml/gatekeeper_v{timestamp}.onnx`
- **Database Tracking**: The `RLModel` table tracks all models with the active one having version `gatekeeper_active`

### Model Promotion

When a new model is trained and performs better:

1. The old active model is backed up to `ml/gatekeeper_active_backup.onnx`
2. The new model is copied to `ml/gatekeeper_active.onnx`
3. Database records are updated to reflect the promotion
4. No code changes or hardcoded paths need updating

### Benefits

- **No hardcoded references**: All code uses the stable `gatekeeper_active.onnx` path
- **Seamless updates**: New models can be promoted without code changes
- **Version history**: All previous models are preserved with timestamps
- **Rollback capability**: Easy to revert to previous models if needed

## Validation

Verify the implementation by checking:

1. Trade logs show gateScore values for all trade decisions
2. Trade count is reduced by ~30% compared to baseline
3. PortfolioRiskManager initializes equity from database

## One-Step Setup

For convenience, you can run the entire setup process with a single command:

```bash
./ml/setup_and_train.sh
```

This script will:
1. Install all Python dependencies
2. Export the dataset from the database
3. Train the model and export to ONNX
4. Register the model in the database

After running this script, you only need to restart the service to activate the gatekeeper.

## Troubleshooting

If the gatekeeper fails to load:
- Check that the ONNX file exists at `ml/gatekeeper_active.onnx`
- Verify the onnxruntime-node dependency is installed
- Check logs for any model loading errors
- Ensure the database has a record with version `gatekeeper_active` 