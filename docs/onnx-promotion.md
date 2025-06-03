# ONNX Model Promotion System

This document describes how the ONNX model promotion system works, including how to promote new models to production.

## Overview

The ONNX model promotion system allows for:

1. **Tracking multiple model versions**: Every ONNX model is registered in the database with a unique ID.
2. **Seamless promotion**: Models can be promoted to be the active production model without code changes or redeployments.
3. **Automatic evaluation**: Weekly retraining includes automatic evaluation and promotion of better-performing models.
4. **Fallback safety**: If a model file is missing, the system falls back to a valid model file.

## Naming Convention

The system uses a consistent naming convention for models:

- **Primary (active) models**: `gatekeeper_primary{ID}` (e.g., `gatekeeper_primary2`)
- **Standard models**: `gatekeeper_{ID}` (e.g., `gatekeeper_1`)

This convention applies to both the database records and the physical files.

## How It Works

The system uses the database as the single source of truth for determining which model file to load:

1. The server looks for a row in the `RLModel` table with a version that starts with `gatekeeper_primary`.
2. It loads the model file specified in the `path` column of that row.
3. To promote a new model, we update its version to use the primary naming convention, and we update the previously primary model to use the standard naming convention.

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

# Promote a model by ID
pnpm tsx packages/server/src/scripts/onnx-promotion.ts promote -i 2

# Check active model
pnpm tsx packages/server/src/scripts/onnx-promotion.ts active
```

For convenience, a script is provided to register and promote the v2 model:

```bash
./promote-v2.sh
```

## Migration to New Naming Convention

If you have models that use the old naming convention, you can migrate them to the new convention using:

```bash
pnpm tsx packages/server/src/scripts/onnx-promotion.ts migrate-naming
```

This will:
1. Rename physical model files to match the new convention
2. Update database records to use the new convention
3. Keep the primary model status unchanged

## Database Schema

The system uses the `RLModel` table with these columns:

- `id`: Auto-incremented ID
- `version`: Model identifier following the naming convention (`gatekeeper_primary{ID}` or `gatekeeper_{ID}`)
- `path`: File path to the ONNX model
- `description`: Optional description
- `createdAt`: Timestamp of model creation

## Best Practices

1. **Always register new models** before promotion to keep track of all available models.
2. **Keep old models** on disk as a fallback if newer models have issues.
3. **Monitor performance** after promotion to ensure the new model behaves as expected.
4. **Use the CLI tools** for managing models to ensure naming convention is followed.

## Troubleshooting

If the server fails to load a model:

1. Check if the file exists at the specified path.
2. Verify the active model by running `pnpm tsx packages/server/src/scripts/onnx-promotion.ts active`.
3. The system will try several fallback files if the primary file is not found.
4. If necessary, promote a different model that is known to work. 