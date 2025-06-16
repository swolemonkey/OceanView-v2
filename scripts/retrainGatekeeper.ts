/**
 * Retrain Gatekeeper Model
 * 
 * This script calls the Python script to train the gatekeeper model
 * and registers it in the database using the new promotion system.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { registerOnnxModel, promoteOnnxModel } from '../packages/server/src/rl/modelPromotion.js';
import path from 'path';

const MODEL_DIR = 'ml';
const TEMP_MODEL_PATH = path.join(MODEL_DIR, 'gatekeeper_retrain_temp.onnx');

// Ensure models directory exists
if (!existsSync(MODEL_DIR)) {
  console.log(`Creating models directory: ${MODEL_DIR}`);
  mkdirSync(MODEL_DIR, { recursive: true });
}

console.log('Training Gatekeeper model...');

try {
  // Run the Python script to train the model
  const output = execSync(`python3 ml/train_gatekeeper.py --out ${TEMP_MODEL_PATH}`, { 
    encoding: 'utf-8',
    stdio: 'inherit'
  });
  
  console.log('Gatekeeper model training completed successfully.');
  console.log(`Model saved to: ${TEMP_MODEL_PATH}`);
  
  // Register the new model in the database
  console.log('Registering new model in database...');
  const newModel = await registerOnnxModel(TEMP_MODEL_PATH, 'Manually retrained gatekeeper model');
  console.log(`Model registered with ID: ${newModel.id}`);
  
  // Promote the new model to be active
  console.log('Promoting new model to active status...');
  const promoted = await promoteOnnxModel(newModel.id);
  
  if (promoted) {
    console.log('✅ New model successfully promoted to active status!');
    console.log('The server will use the new model on next restart.');
  } else {
    console.log('❌ Failed to promote new model to active status.');
  }
  
} catch (error) {
  console.error('Error training Gatekeeper model:');
  console.error(error);
  process.exit(1);
} 