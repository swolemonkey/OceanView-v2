// @ts-ignore
import { InferenceSession } from 'onnxruntime-node';
// @ts-ignore
import * as ort from 'onnxruntime-node';
import { prisma } from '../../../db.js';

export interface FeatureVector {
  rsi14: number;
  fastMA: number;
  slowMA: number;
  smcPattern: number;
}

/**
 * RL Gatekeeper - Uses a trained model to approve or veto trade ideas
 * Based on reinforcement learning from past trade outcomes
 */
export class Gatekeeper {
  private sess: InferenceSession;
  private threshold = 0.55; // Veto trades with score below this
  private isActive = true;  // Active veto mode
  private modelId: number = 0; // Initialize with default value
  
  /**
   * Initialize the gatekeeper with a model
   * @param modelPath Path to the ONNX model file
   * @returns Promise that resolves when model is loaded
   */
  async init(modelPath: string, modelId: number): Promise<void> {
    this.sess = await InferenceSession.create(modelPath);
    this.modelId = modelId;
    console.log(`Gatekeeper initialized with model ${modelPath}, threshold ${this.threshold}`);
  }
  
  /**
   * Score a feature vector using the loaded model
   * @param featureVec Feature vector for the trade idea
   * @returns Probability score (0-1) for approving the trade
   */
  score(featureVec: FeatureVector): number {
    // Extract features in the order expected by the model
    const features = [
      featureVec.rsi14, 
      featureVec.fastMA, 
      featureVec.slowMA, 
      featureVec.smcPattern
    ];
    
    // Create tensor from features
    const input = new ort.Tensor('float32', Float32Array.from(features), [1, features.length]);
    
    // Run inference
    const outputs = this.sess.run({ float_input: input });
    
    // Extract probability (assuming model outputs probability)
    // The exact output tensor name may vary based on your exported model
    const probTensor = outputs.probabilities || outputs.probability || outputs.output_probability;
    
    // Return probability of the positive class (approve)
    return probTensor.data[1];
  }
  
  /**
   * Determine whether to allow a trade based on the model score
   * @param featureVec Feature vector for the trade idea
   * @returns Object with decision and score
   */
  approve(featureVec: FeatureVector): { approved: boolean; score: number } {
    const score = this.score(featureVec);
    const approved = !this.isActive || score >= this.threshold;
    
    return { approved, score };
  }
  
  /**
   * Log a trade decision to the RL dataset for future training
   * @param symbol Asset symbol
   * @param featureVec Feature vector used for decision
   * @param action Whether trade was executed ('buy' or 'skip')
   * @param score Model score
   */
  async logDecision(
    symbol: string, 
    featureVec: FeatureVector, 
    action: 'buy' | 'skip', 
    score: number
  ): Promise<void> {
    await prisma.rLDataset.create({
      data: {
        symbol,
        featureVec,
        action,
        gateScore: score,
        outcome: 0, // Will be updated when trade completes
        modelId: this.modelId
      }
    });
  }
  
  /**
   * Update a trade outcome in the dataset
   * @param id Dataset record ID
   * @param outcome Trade outcome (P&L)
   */
  async updateOutcome(id: number, outcome: number): Promise<void> {
    await prisma.rLDataset.update({
      where: { id },
      data: { outcome }
    });
  }
}

/**
 * Factory function to create and initialize a gatekeeper instance
 * @returns Initialized gatekeeper or null if no model available
 */
export async function createGatekeeper(): Promise<Gatekeeper | null> {
  try {
    // Find the latest model in the database
    // Use findMany without parameters since it doesn't accept parameters in our mock
    const models = await prisma.rLModel.findMany();
    
    // If no models available, return null
    if (!models || models.length === 0) {
      console.log('No RL model found in database');
      return null;
    }
    
    // Get the latest model (assuming it's the first one returned)
    // Handle potential type issues with the mock data
    const latestModel = models[0];
    
    // Type guard to ensure the model has the required properties
    if (!latestModel || typeof latestModel.path !== 'string' || typeof latestModel.id !== 'number') {
      console.log('Invalid model data found');
      return null;
    }
    
    // Initialize gatekeeper with the model
    const gatekeeper = new Gatekeeper();
    await gatekeeper.init(latestModel.path, latestModel.id);
    
    return gatekeeper;
  } catch (error) {
    console.error('Failed to initialize gatekeeper:', error);
    return null;
  }
} 