# ONNX Model Promotion System

This document describes how the ONNX model promotion system works, including how to promote new models to production.

## Overview

The ONNX model promotion system allows for:

1. **Tracking multiple model versions**: Every ONNX model is registered in the database with a unique version ID.
2. **Seamless promotion**: Models can be promoted to be the active production model without code changes or redeployments.
3. **Automatic evaluation**: Weekly retraining includes automatic evaluation and promotion of better-performing models.
4. **Fallback safety**: If a model file is missing, the system falls back to a default model.

## How It Works

The system uses the database as the single source of truth for determining which model file to load:

1. The server looks for a row in the `RLModel` table with `version = 'gatekeeper_v1'`.
2. It loads the model file specified in the `path` column of that row.
3. To promote a new model, we simply update which row has the `version = 'gatekeeper_v1'` identifier.

## Model States

Models can have different version identifiers:

- `gatekeeper_v1`: The active production model that is loaded on server startup.
- `gatekeeper_YYYYMMDD`: Timestamped model versions (not active).
- `gatekeeper_old_TIMESTAMP`: Previously active models that have been demoted.

## Promotion Methods

### Automatic Promotion (Weekly)

Every Monday at 2:00 UTC, the system:

1. Retrains a new model using the latest data.
2. Evaluates both the new and current model using metrics like Sharpe ratio.
3. If the new model performs better, it automatically becomes the active model.

### Manual Promotion

You can manually promote models using the CLI tool:

```bash
# List all models
pnpm tsx packages/server/src/scripts/onnx-promotion.ts list

# Register a new model
pnpm tsx packages/server/src/scripts/onnx-promotion.ts register -p "path/to/model.onnx" -n "Description"

# Promote a model
pnpm tsx packages/server/src/scripts/onnx-promotion.ts promote -v "gatekeeper_20250603"

# Check active model
pnpm tsx packages/server/src/scripts/onnx-promotion.ts active
```

For convenience, a script is provided to register and promote the v2 model:

```bash
./promote-v2.sh
```

## Database Schema

The system uses the `RLModel` table with these columns:

- `id`: Auto-incremented ID
- `version`: Unique identifier string (e.g., "gatekeeper_v1")
- `path`: File path to the ONNX model
- `description`: Optional description
- `createdAt`: Timestamp of model creation

## Best Practices

1. **Always register new models** before promotion to keep track of all available models.
2. **Keep old models** on disk as a fallback if newer models have issues.
3. **Monitor performance** after promotion to ensure the new model behaves as expected.
4. **Use timestamped versions** for better tracking and auditability.

## Troubleshooting

If the server fails to load a model:

1. Check if the file exists at the specified path.
2. Verify the active model by running `pnpm tsx packages/server/src/scripts/onnx-promotion.ts active`.
3. If necessary, promote a different model that is known to work. 