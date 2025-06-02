import * as tf from '@tensorflow/tfjs-node';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { prisma } from '@/db.js';
import { createLogger } from '@/utils/logger.js';

const exec = promisify(execCallback);
const logger = createLogger('gatekeeper');

/**
 * Retrains the gatekeeper model using the latest RL dataset
 * @returns Promise that resolves when retraining is complete
 */
export async function retrainGatekeeper() {
  logger.info('Starting gatekeeper retraining...');
  
  // Export the dataset
  logger.debug('Exporting RL dataset...');
  await exec('pnpm ts-node scripts/export_rl_dataset.ts');
  
  // Train the model
  const tempPath = 'ml/tmp.onnx';
  logger.debug(`Training model to ${tempPath}...`);
  await exec(`python ml/train_gatekeeper.py --output ${tempPath}`);
  
  // Generate a version hash
  const { stdout } = await exec(`sha1sum ${tempPath}`);
  const version = 'gatekeeper_' + stdout.split(' ')[0].slice(0, 8);
  
  // Register the model in the database
  logger.debug('Registering new model...');
  await prisma.rLModel.create({ 
    data: { 
      version: version, 
      path: tempPath, 
      description: 'auto-retrain' 
    }
  });
  
  logger.info('Gatekeeper retraining completed successfully');
  return { version, path: tempPath };
} 