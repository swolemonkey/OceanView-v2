import { prisma } from '../db.js';
import { InferenceSession, Tensor } from 'onnxruntime-node';
import path from 'path';

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
    this.loadModel();
  }

  /**
   * Load the ONNX model
   */
  private async loadModel(): Promise<void> {
    try {
      // Get the latest model from the database
      const model = await prisma.rLModel.findFirst({
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (model) {
        this.modelPath = model.path;
        // Use absolute path to the model file
        const modelPath = path.resolve(process.cwd(), model.path);
        this.session = await InferenceSession.create(modelPath);
        this.modelLoaded = true;
        console.log(`[${new Date().toISOString()}] Loaded RL model: ${model.version}`);
      } else {
        console.log(`[${new Date().toISOString()}] No RL model found in database.`);
      }
    } catch (error) {
      console.error('Error loading RL model:', error);
    }
  }

  /**
   * Score a trade idea based on feature vector
   * Uses the ONNX model if available, otherwise falls back to random
   * @param {FeatureVector} features Feature vector for the model
   * @param {string} action Proposed action (buy|sell|skip)
   * @returns {number} Confidence score between 0-1
   */
  public async scoreIdea(features: FeatureVector, action: string): Promise<number> {
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
        
        // Create tensor for inference
        const input = new Tensor('float32', Float32Array.from(featureVec), [1, featureVec.length]);
        
        // Run inference
        const output = await this.session.run({ input });
        
        // Extract score from output (probability)
        score = output.probabilities ? 
          Number(output.probabilities.data[0]) : 
          Number(output.probability.data[0]);
        
        console.log(`[${new Date().toISOString()}] Gatekeeper score=${score.toFixed(4)} for ${action} ${features.symbol}`);
      } catch (error) {
        console.error('Error scoring with RL model:', error);
        // Fall back to random score
        score = Math.random();
      }
    } else {
      // If model not loaded, use random score (shadow mode)
      score = Math.random();
      console.log(`[${new Date().toISOString()}] Shadow mode: score=${score.toFixed(4)}`);
    }
    
    // Log feature vector and score to database
    this.logFeatures(features, action, score);
    
    return score;
  }

  /**
   * Log feature vector, action, and score to database for future training
   * @param {FeatureVector} features Feature vector
   * @param {string} action Proposed action
   * @param {number} score Confidence score
   */
  private async logFeatures(features: FeatureVector, action: string, score: number): Promise<void> {
    try {
      await prisma.rLDataset.create({
        data: {
          symbol: features.symbol,
          featureVec: JSON.stringify(features),
          action: action,
          outcome: 0, // Will be updated when trade is closed
          gateScore: score,
          strategyVersionId: this.strategyVersionId
        }
      });
    } catch (error) {
      console.error('Error logging RL feature vector:', error);
    }
  }

  /**
   * Update outcome for a previous trade
   * @param {string} symbol Symbol
   * @param {number} timestamp Timestamp of the original trade
   * @param {number} pnl Realized PnL from the trade
   */
  public async updateOutcome(symbol: string, timestamp: number, pnl: number): Promise<void> {
    try {
      // Find the most recent feature vector for this symbol near the timestamp
      const datasets = await prisma.rLDataset.findMany({
        where: {
          symbol: symbol,
          ts: {
            // Find entries within 5 minutes of the timestamp
            gte: new Date(timestamp - 5 * 60 * 1000),
            lte: new Date(timestamp + 5 * 60 * 1000)
          }
        },
        orderBy: {
          ts: 'desc'
        },
        take: 1
      });

      if (datasets.length > 0) {
        // Update the outcome with the realized PnL
        await prisma.rLDataset.update({
          where: {
            id: datasets[0].id
          },
          data: {
            outcome: pnl
          }
        });
      }
    } catch (error) {
      console.error('Error updating RL outcome:', error);
    }
  }
} 