import { prisma } from '@/db.js';
import { InferenceSession, Tensor } from 'onnxruntime-node';
import path from 'path';
import { createLogger } from '@/utils/logger.js';

// Create logger
const logger = createLogger('gatekeeper');

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
   * Initialize the ONNX model
   * @param path Path to the ONNX model file
   * @returns Promise that resolves when the model is loaded
   */
  async init(path: string): Promise<void> {
    try {
      this.modelPath = path;
      logger.info(`Loading RL model from ${path}`);
      this.session = await InferenceSession.create(path);
      this.modelLoaded = true;
      logger.info(`Successfully loaded RL model: ${path}`);
    } catch (err) {
      logger.error('Error loading RL model', {
        error: err instanceof Error ? err.message : err,
        stack: err instanceof Error ? err.stack : null,
        path: path,
        context: 'gatekeeper'
      });
      // Critical error - exit the process so Fly.io will restart it
      process.exit(1);
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

export default RLGatekeeper; 