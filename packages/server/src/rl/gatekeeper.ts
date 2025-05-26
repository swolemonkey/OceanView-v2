import { prisma } from '../db.js';

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
  [key: string]: any; // Allow for additional features
}

/**
 * RL Gatekeeper - currently in shadow mode
 * Returns random scores between 0-1 for trade ideas
 * Logs feature vectors and scores for future model training
 */
export class RLGatekeeper {
  private strategyVersionId: number;

  constructor(strategyVersionId: number) {
    this.strategyVersionId = strategyVersionId;
  }

  /**
   * Score a trade idea based on feature vector
   * Currently returns random score between 0-1
   * @param {FeatureVector} features Feature vector for the model
   * @param {string} action Proposed action (buy|sell|skip)
   * @returns {number} Confidence score between 0-1
   */
  public scoreIdea(features: FeatureVector, action: string): number {
    // In shadow mode, generate random score between 0-1
    const score = Math.random();
    
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