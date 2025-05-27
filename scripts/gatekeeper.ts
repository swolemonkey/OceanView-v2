#!/usr/bin/env node
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { prisma } from '../packages/server/src/db.js';

/**
 * Script to automate Gatekeeper retraining and registration
 * Usage: 
 *   ts-node scripts/gatekeeper.ts [retrain|register|both] [model_version]
 */

async function main() {
  const args = process.argv.slice(2);
  const action = args[0] || 'both'; // default to both
  const modelVersion = args[1] || `gatekeeper_v${Date.now()}`;
  const modelPath = `./ml/${modelVersion}.onnx`;
  const description = args[2] || `Automatically trained on ${new Date().toISOString()}`;
  
  try {
    // Retrain the model if requested
    if (action === 'retrain' || action === 'both') {
      console.log('🧠 Retraining Gatekeeper model...');
      try {
        // Assumes the ML training script is in the ml directory
        execSync('python3 ml/train_gatekeeper.py', { stdio: 'inherit' });
        console.log('✅ Model retraining completed');
      } catch (error) {
        console.error('❌ Model retraining failed:', error);
        process.exit(1);
      }
    }
    
    // Register the model if requested
    if (action === 'register' || action === 'both') {
      console.log(`📝 Registering model as ${modelVersion}...`);
      
      // Check if the model file exists
      if (!fs.existsSync(modelPath)) {
        console.error(`❌ Model file not found at ${modelPath}`);
        process.exit(1);
      }
      
      // Register the model in the database
      const model = await prisma.rLModel.create({
        data: {
          version: modelVersion,
          path: modelPath,
          description
        }
      });
      
      console.log('✅ Model registered successfully:', model);
    }
    
    console.log('🎉 Gatekeeper process completed successfully');
  } catch (error) {
    console.error('❌ Error during Gatekeeper process:', error);
    process.exit(1);
  }
}

main(); 