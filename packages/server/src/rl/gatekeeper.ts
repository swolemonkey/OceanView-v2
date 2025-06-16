import { prisma } from '../db';
import { InferenceSession, Tensor } from 'onnxruntime-node';
import path from 'path';
import { createLogger } from '../utils/logger';
import fs from 'fs';
import { getActiveModelPath } from './modelPromotion.js';

// Create logger
const logger = createLogger('gatekeeper');

// Helper function to resolve paths
function resolveModelPath(modelPath: string): string {
  // If it's already an absolute path, return it
  if (path.isAbsolute(modelPath)) {
    return modelPath;
  }
  
  // Check if the file exists in the current directory
  if (fs.existsSync(modelPath)) {
    return modelPath;
  }
  
  // Try to resolve from project root
  const projectRootPath = path.resolve(process.cwd(), '..', '..', modelPath);
  if (fs.existsSync(projectRootPath)) {
    return projectRootPath;
  }
  
  // If we can't find it, return the original path and let the caller handle it
  return modelPath;
}

/**
 * Feature vector for RL model input
 */
export interface FeatureVector {
  symbol: string;
  price: number;
  rsi: number;
  adx: number;
  volatility: number;
  recentTrend: number;
  dayOfWeek: number;
  hourOfDay: number;
  // New features for ONNX model
  rsi14?: number;
  adx14?: number;
  fastMASlowDelta?: number;
  bbWidth?: number;
  avgSent?: number;
  avgOB?: number;
  [key: string]: any; // Allow for additional features
}

/**
 * RL Gatekeeper - active model-based scoring
 */
export class RLGatekeeper {
  private strategyVersionId: number;
  private session: InferenceSession | null = null;
  private modelLoaded = false;
  private modelPath = '';

  constructor(strategyVersionId: number) {
    this.strategyVersionId = strategyVersionId;
  }

  /**
   * Initialize the gatekeeper with a trained ONNX model
   * @param modelPath Path to the ONNX model file (defaults to the stable active model path)
   * @returns Promise that resolves when the model is loaded
   */
  async init(modelPath?: string): Promise<void> {
    try {
      // Use the stable active model path if no specific path is provided
      const pathToUse = modelPath || getActiveModelPath();
      
      // Resolve the model path to an absolute path
      const resolvedPath = resolveModelPath(pathToUse);
      this.modelPath = resolvedPath;
      
      logger.info(`Loading RL model from ${resolvedPath}`);
      this.session = await InferenceSession.create(resolvedPath);
      this.modelLoaded = true;
      logger.info(`Successfully loaded RL model: ${resolvedPath}`);
    } catch (err) {
      logger.error('Error loading RL model', {
        error: err instanceof Error ? err.message : err,
        stack: err instanceof Error ? err.stack : null,
        path: modelPath,
        context: 'gatekeeper'
      });
      // Instead of exiting, continue with shadow mode
      logger.info('Continuing in shadow mode with mock model');
      this.modelLoaded = false;
      // Don't exit the process - just continue
    }
  }

  /**
   * Score a feature vector using the loaded model
   * @param vec Feature vector for the model
   * @returns Probability score (0-1)
   */
  public async score(vec: number[]): Promise<number> {
    if (!this.session) {
      logger.error('Attempting to score without initialized model');
      return 0.5;
    }
    
    try {
      const result = await this.session.run({ 
        input: new Tensor('float32', Float32Array.from(vec), [1, vec.length])
      });
      
      // The output tensor name may vary based on your model
      // Look for a property that contains the probability data
      const outputKeys = Object.keys(result);
      if (outputKeys.length > 0) {
        const outputTensor = result[outputKeys[0]];
        if (outputTensor && outputTensor.data && outputTensor.data.length > 0) {
          return Number(outputTensor.data[0]);
        }
      }
      return 0.5; // Default if we can't extract the probability
    } catch (error) {
      logger.error('Error scoring with RL model:', { error });
      return 0.5;
    }
  }

  /**
   * Score a trade idea based on feature vector
   * Uses the ONNX model if available, otherwise falls back to random
   * @param {FeatureVector} features Feature vector for the model
   * @param {string} action Proposed action (buy|sell|skip)
   * @returns {Promise<{score: number, id: number}>} Confidence score between 0-1 and database entry ID
   */
  public async scoreIdea(features: FeatureVector, action: string): Promise<{score: number, id: number}> {
    let score = 0.5; // Default middle score
    
    // If model is loaded, use it to score the idea
    if (this.modelLoaded && this.session) {
      try {
        // Prepare feature vector for model
        const featureVec = [
          features.rsi14 || features.rsi || 50,
          features.adx14 || features.adx || 25,
          features.fastMASlowDelta || 0,
          features.bbWidth || 0,
          features.avgSent || 0,
          features.avgOB || 0,
          action === 'buy' ? 1 : 0
        ];
        
        score = await this.score(featureVec);
        
        logger.debug(`Gatekeeper score=${score.toFixed(4)} for ${action} ${features.symbol}`);
      } catch (error) {
        logger.error('Error scoring with RL model:', { error });
        // Fall back to random score
        score = Math.random();
      }
    } else {
      // If model not loaded, use random score (shadow mode)
      score = Math.random();
      logger.debug(`Shadow mode: score=${score.toFixed(4)}`);
    }
    
    // Log feature vector and score to database
    const id = await this.logFeatures(features, action, score);
    
    return { score, id };
  }

  /**
   * Log feature vector, action, and score to database for future training
   * @param {FeatureVector} features Feature vector
   * @param {string} action Proposed action
   * @param {number} score Confidence score
   * @returns {Promise<number>} ID of the created database entry
   */
  private async logFeatures(features: FeatureVector, action: string, score: number): Promise<number> {
    try {
      const entry = await prisma.rLDataset.create({
        data: {
          symbol: features.symbol,
          featureVec: JSON.stringify(features),
          action: action,
          outcome: 0, // Will be updated when trade is closed
          gateScore: score,
          strategyVersionId: this.strategyVersionId
        }
      });
      return entry.id;
    } catch (error) {
      logger.error('Error logging RL feature vector:', { error });
      return 0;
    }
  }

  /**
   * Update outcome for a previous trade decision
   * @param {number} id ID of the dataset entry to update
   * @param {number} pnl P&L outcome value
   */
  public async updateOutcome(id: number, pnl: number): Promise<void> {
    try {
      await prisma.rLDataset.update({
        where: { id },
        data: { outcome: pnl }
      });
      logger.debug(`Updated outcome for entry ${id}: ${pnl}`);
    } catch (error) {
      logger.error(`Error updating outcome for entry ${id}:`, { error });
    }
  }
}

// Create a singleton instance of RLGatekeeper
export const gate = new RLGatekeeper(1); 