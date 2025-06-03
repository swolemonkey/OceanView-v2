import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { prisma } from '../db.js';
import { createLogger } from '../utils/logger.js';
import { registerOnnxModel, promoteOnnxModel, getActiveModel } from './modelPromotion.js';
import path from 'path';
import fs from 'fs';

const exec = promisify(execCallback);
const logger = createLogger('gatekeeper');

/**
 * Calculate Sharpe ratio based on model's predictions and outcomes
 * @param modelId The ID of the model to evaluate
 * @returns Promise that resolves with the calculated Sharpe ratio
 */
async function calculateSharpe(modelId: number): Promise<number> {
  try {
    // Get dataset entries associated with this model
    const entries = await prisma.rLDataset.findMany({
      where: { modelId },
      select: { gateScore: true, outcome: true }
    });
    
    if (entries.length === 0) {
      logger.warn(`No dataset entries found for model ${modelId}`);
      return 0;
    }
    
    // Calculate returns based on predictions and outcomes
    const returns = entries.map(entry => {
      const score = entry.gateScore || 0.5;
      const outcome = entry.outcome || 0;
      // Simple way to calculate return - higher score for correct direction
      return (score > 0.5 ? 1 : -1) * outcome;
    });
    
    // Calculate Sharpe ratio (mean / std)
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    const std = Math.sqrt(variance || 0.0001); // Avoid division by zero
    
    return mean / std;
  } catch (error) {
    logger.error('Error calculating Sharpe ratio:', { error });
    return 0;
  }
}

/**
 * Retrains the gatekeeper model using the latest RL dataset
 * @param options Optional parameters for retraining
 * @returns Promise that resolves when retraining is complete
 */
export async function retrainGatekeeper(options: { 
  autoPromote?: boolean, 
  outputPath?: string 
} = {}) {
  logger.info('Starting gatekeeper retraining...');
  
  // Export the dataset
  logger.debug('Exporting RL dataset...');
  await exec('pnpm ts-node scripts/export_rl_dataset.ts');
  
  // Create dated model file path
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const modelFileName = options.outputPath || `ml/gatekeeper_retrain_${timestamp}.onnx`;
  
  // Train the model
  logger.debug(`Training model to ${modelFileName}...`);
  await exec(`python ml/train_gatekeeper.py --output ${modelFileName}`);
  
  // Register the model in the database
  logger.debug('Registering new model...');
  const newModel = await registerOnnxModel(
    modelFileName,
    `Auto-retrained model ${timestamp}`
  );
  
  // If auto-promote is enabled, evaluate and potentially promote the model
  if (options.autoPromote) {
    logger.info('Auto-promote enabled, evaluating model performance...');
    
    // Get the current active model
    const currentModel = await getActiveModel();
    
    if (!currentModel) {
      // If no current model exists, automatically promote this one
      logger.info('No current active model found, promoting new model');
      await promoteOnnxModel(newModel.id);
      return { id: newModel.id, path: newModel.path, promoted: true };
    }
    
    // Calculate Sharpe ratios for both models
    const newSharpe = await calculateSharpe(newModel.id);
    const currentSharpe = await calculateSharpe(currentModel.id);
    
    logger.info(`Performance comparison - Current: ${currentSharpe.toFixed(4)}, New: ${newSharpe.toFixed(4)}`);
    
    // If new model performs better, promote it
    if (newSharpe > currentSharpe) {
      logger.info(`New model outperforms current (${newSharpe.toFixed(4)} > ${currentSharpe.toFixed(4)}), promoting`);
      await promoteOnnxModel(newModel.id);
      return { id: newModel.id, path: newModel.path, promoted: true };
    } else {
      logger.info(`Current model performs better, keeping it active`);
      return { id: newModel.id, path: newModel.path, promoted: false };
    }
  }
  
  logger.info('Gatekeeper retraining completed successfully');
  return { id: newModel.id, path: newModel.path };
} 