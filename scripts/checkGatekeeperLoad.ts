/**
 * Simple script to verify that the gatekeeper model loads correctly
 */

import { InferenceSession } from 'onnxruntime-node';
import path from 'path';

const MODEL_PATH = path.resolve('packages/server/models/gatekeeper_v1.onnx');

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