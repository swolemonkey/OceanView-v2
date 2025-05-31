#!/usr/bin/env ts-node
import { retrainGatekeeper } from '../packages/server/src/rl/retrainJob.js';
import { createLogger } from '../packages/server/src/utils/logger.js';

/**
 * Script to automate Gatekeeper retraining and registration
 * Usage: 
 *   ts-node scripts/gatekeeper.ts [retrain|register|both] [model_version]
 */

const logger = createLogger('gatekeeper-cli');

async function main() {
  logger.info('Starting Gatekeeper retraining...');
  
  try {
    const result = await retrainGatekeeper();
    logger.info(`Gatekeeper retraining completed successfully.`);
    logger.info(`Model saved: ${result.version} at ${result.path}`);
  } catch (error) {
    logger.error('Error during Gatekeeper retraining:', { error });
    process.exit(1);
  }
}

main(); 