#!/usr/bin/env ts-node
import { retrainGatekeeper } from '../packages/server/src/bots/hypertrades/rl/retrainJob.js';

/**
 * Script to automate Gatekeeper retraining and registration
 * Usage: 
 *   ts-node scripts/gatekeeper.ts [retrain|register|both] [model_version]
 */

async function main() {
  console.log('Starting Gatekeeper retraining...');
  
  try {
    const result = await retrainGatekeeper();
    console.log(`Gatekeeper retraining completed successfully.`);
    console.log(`Model saved successfully.`);
  } catch (error) {
    console.error('Error during Gatekeeper retraining:', error);
    process.exit(1);
  }
}

main(); 