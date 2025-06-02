/**
 * Retrain Gatekeeper Model
 * 
 * This script calls the Python script to train the gatekeeper model
 * and updates the database with the new model.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

const MODEL_DIR = 'packages/server/models';
const MODEL_PATH = path.join(MODEL_DIR, 'gatekeeper_v1.onnx');

// Ensure models directory exists
if (!existsSync(MODEL_DIR)) {
  console.log(`Creating models directory: ${MODEL_DIR}`);
  mkdirSync(MODEL_DIR, { recursive: true });
}

console.log('Training Gatekeeper model...');

try {
  // Run the Python script
  const output = execSync(`python3 ml/train_gatekeeper.py --out ${MODEL_PATH}`, { 
    encoding: 'utf-8',
    stdio: 'inherit'
  });
  
  console.log('Gatekeeper model training completed successfully.');
  console.log(`Model saved to: ${MODEL_PATH}`);
} catch (error) {
  console.error('Error training Gatekeeper model:');
  console.error(error);
  process.exit(1);
} 