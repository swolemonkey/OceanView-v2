/**
 * Simple script to verify that the gatekeeper model loads correctly
 */

import { InferenceSession } from 'onnxruntime-node';
import { getActiveModelPath } from '../packages/server/src/rl/modelPromotion.js';
import path from 'path';

// Use the stable active model path
const MODEL_PATH = path.resolve(getActiveModelPath());

async function main() {
  console.log(`Attempting to load model from: ${MODEL_PATH}`);
  
  try {
    const session = await InferenceSession.create(MODEL_PATH);
    console.log('✅ Model loaded successfully!');
    console.log(`Model inputs: ${session.inputNames}`);
    console.log(`Model outputs: ${session.outputNames}`);
  } catch (error) {
    console.error('❌ Failed to load model:', error);
    process.exit(1);
  }
}

main(); 