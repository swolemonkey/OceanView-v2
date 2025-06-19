import { createLogger } from '../../utils/logger.js';
import { prisma } from '../../db.js';

const logger = createLogger('expectancy-manager');

/**
 * Strategy performance metrics for expectancy calculation
 */
export interface StrategyMetrics {
  strategyName: string;
  symbol?: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalProfit: number;
  totalLoss: number;
  avgWin: number;
  avgLoss: number;
  winRate: number;
  expectancy: number;
  lastUpdated: Date;
  sampleSize: number;
  confidence: number;
}

/**
 * Trade outcome for updating metrics
 */
export interface TradeOutcome {
  strategyName: string;
  symbol: string;
  pnl: number;
  isWin: boolean;
  timestamp: Date;
}

/**
 * Expectancy filter configuration
 */
export interface ExpectancyConfig {
  minSampleSize: number;        // Minimum trades before filtering
  minExpectancy: number;        // Minimum expectancy to allow trading
  confidenceThreshold: number;  // Statistical confidence required
  adaptivePeriod: number;       // Rolling window for calculations (days)
  strategySpecific: boolean;    // Use strategy-specific vs global expectancy
}

/**
 * ExpectancyManager - Tracks strategy performance and filters negative expectancy trades
 */
export class ExpectancyManager {
  private metrics: Map<string, StrategyMetrics> = new Map();
  private config: ExpectancyConfig;
  private lastUpdateTime = 0;
  private updateInterval = 300000; // 5 minutes

  constructor(config?: Partial<ExpectancyConfig>) {
    this.config = {
      minSampleSize: 10,           // Need 10 trades before filtering
      minExpectancy: 0.01,         // Minimum 1% positive expectancy
      confidenceThreshold: 0.7,    // 70% confidence threshold
      adaptivePeriod: 30,          // 30-day rolling window
      strategySpecific: true,      // Use strategy-specific expectancy
      ...config
    };
    
    // Load existing metrics from database
    this.loadMetricsFromDatabase();
  }

  /**
   * Load historical metrics from database
   */
  private async loadMetricsFromDatabase(): Promise<void> {
    try {
      // Query recent trades to rebuild metrics
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.adaptivePeriod);

      const trades = await prisma.trade.findMany({
        where: {
          ts: {
            gte: cutoffDate
          }
        },
        select: {
          strategy: true,
          symbol: true,
          pnl: true,
          ts: true
        }
      });

      // Group trades by strategy and symbol
      const groupedTrades = new Map<string, TradeOutcome[]>();
      
      for (const trade of trades) {
        const key = this.config.strategySpecific 
          ? `${trade.strategy}_${trade.symbol}`
          : trade.strategy || 'unknown';
        
        if (!groupedTrades.has(key)) {
          groupedTrades.set(key, []);
        }
        
        const pnlValue = trade.pnl ? Number(trade.pnl) : 0;
        groupedTrades.get(key)!.push({
          strategyName: trade.strategy || 'unknown',
          symbol: trade.symbol,
          pnl: pnlValue,
          isWin: pnlValue > 0,
          timestamp: trade.ts
        });
      }

      // Calculate metrics for each group
      for (const [key, tradeList] of groupedTrades) {
        const metrics = this.calculateMetrics(tradeList);
        this.metrics.set(key, metrics);
      }

      logger.info("📊 EXPECTANCY: Loaded historical metrics from database", {
        metricsLoaded: this.metrics.size,
        totalTrades: trades.length,
        adaptivePeriod: this.config.adaptivePeriod
      });

    } catch (error) {
      logger.error("❌ EXPECTANCY: Failed to load metrics from database", { error });
    }
  }

  /**
   * Calculate strategy metrics from trade outcomes
   */
  private calculateMetrics(trades: TradeOutcome[]): StrategyMetrics {
    if (trades.length === 0) {
      throw new Error("Cannot calculate metrics for empty trade list");
    }

    const wins = trades.filter(t => t.isWin);
    const losses = trades.filter(t => !t.isWin);
    
    const totalProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
    const totalLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
    
    const avgWin = wins.length > 0 ? totalProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? totalLoss / losses.length : 0;
    const winRate = wins.length / trades.length;
    
    // Calculate expectancy: (Win Rate × Avg Win) - (Loss Rate × Avg Loss)
    const expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss);
    
    // Calculate confidence based on sample size and consistency
    const sampleSize = trades.length;
    const confidence = Math.min(0.95, sampleSize / 50); // Max confidence at 50 trades
    
    return {
      strategyName: trades[0].strategyName,
      symbol: trades[0].symbol,
      totalTrades: sampleSize,
      winningTrades: wins.length,
      losingTrades: losses.length,
      totalProfit,
      totalLoss,
      avgWin,
      avgLoss,
      winRate,
      expectancy,
      lastUpdated: new Date(),
      sampleSize,
      confidence
    };
  }

  /**
   * Update metrics with new trade outcome
   */
  async updateMetrics(outcome: TradeOutcome): Promise<void> {
    const key = this.config.strategySpecific 
      ? `${outcome.strategyName}_${outcome.symbol}`
      : outcome.strategyName;

    try {
      // Get existing metrics or create new
      let existingMetrics = this.metrics.get(key);
      
      if (!existingMetrics) {
        // Create initial metrics
        existingMetrics = {
          strategyName: outcome.strategyName,
          symbol: outcome.symbol,
          totalTrades: 0,
          winningTrades: 0,
          losingTrades: 0,
          totalProfit: 0,
          totalLoss: 0,
          avgWin: 0,
          avgLoss: 0,
          winRate: 0,
          expectancy: 0,
          lastUpdated: new Date(),
          sampleSize: 0,
          confidence: 0
        };
      }

      // Update metrics incrementally
      existingMetrics.totalTrades += 1;
      existingMetrics.sampleSize = existingMetrics.totalTrades;
      
      if (outcome.isWin) {
        existingMetrics.winningTrades += 1;
        existingMetrics.totalProfit += outcome.pnl;
        existingMetrics.avgWin = existingMetrics.totalProfit / existingMetrics.winningTrades;
      } else {
        existingMetrics.losingTrades += 1;
        existingMetrics.totalLoss += Math.abs(outcome.pnl);
        existingMetrics.avgLoss = existingMetrics.totalLoss / existingMetrics.losingTrades;
      }
      
      existingMetrics.winRate = existingMetrics.winningTrades / existingMetrics.totalTrades;
      existingMetrics.expectancy = (existingMetrics.winRate * existingMetrics.avgWin) - 
                                   ((1 - existingMetrics.winRate) * existingMetrics.avgLoss);
      existingMetrics.confidence = Math.min(0.95, existingMetrics.sampleSize / 50);
      existingMetrics.lastUpdated = new Date();

      // Store updated metrics
      this.metrics.set(key, existingMetrics);

      logger.debug("📊 EXPECTANCY: Updated strategy metrics", {
        strategy: outcome.strategyName,
        symbol: outcome.symbol,
        pnl: outcome.pnl,
        newExpectancy: existingMetrics.expectancy.toFixed(4),
        winRate: (existingMetrics.winRate * 100).toFixed(1) + '%',
        sampleSize: existingMetrics.sampleSize,
        confidence: (existingMetrics.confidence * 100).toFixed(1) + '%'
      });

    } catch (error) {
      logger.error("❌ EXPECTANCY: Failed to update metrics", { 
        error, 
        strategy: outcome.strategyName, 
        symbol: outcome.symbol 
      });
    }
  }

  /**
   * Check if a strategy should be allowed to trade based on expectancy
   */
  shouldAllowTrade(strategyName: string, symbol: string): {
    allowed: boolean;
    reason: string;
    expectancy?: number;
    confidence?: number;
    sampleSize?: number;
  } {
    const key = this.config.strategySpecific 
      ? `${strategyName}_${symbol}`
      : strategyName;

    const metrics = this.metrics.get(key);

    // Allow trading if no historical data (new strategy/symbol combination)
    if (!metrics) {
      return {
        allowed: true,
        reason: 'no_historical_data',
        expectancy: 0,
        confidence: 0,
        sampleSize: 0
      };
    }

    // Allow trading if sample size is too small for reliable filtering
    if (metrics.sampleSize < this.config.minSampleSize) {
      return {
        allowed: true,
        reason: 'insufficient_sample_size',
        expectancy: metrics.expectancy,
        confidence: metrics.confidence,
        sampleSize: metrics.sampleSize
      };
    }

    // Check confidence threshold
    if (metrics.confidence < this.config.confidenceThreshold) {
      return {
        allowed: true,
        reason: 'low_confidence',
        expectancy: metrics.expectancy,
        confidence: metrics.confidence,
        sampleSize: metrics.sampleSize
      };
    }

    // Check expectancy threshold
    if (metrics.expectancy < this.config.minExpectancy) {
      return {
        allowed: false,
        reason: 'negative_expectancy',
        expectancy: metrics.expectancy,
        confidence: metrics.confidence,
        sampleSize: metrics.sampleSize
      };
    }

    return {
      allowed: true,
      reason: 'positive_expectancy',
      expectancy: metrics.expectancy,
      confidence: metrics.confidence,
      sampleSize: metrics.sampleSize
    };
  }

  /**
   * Get current metrics for a strategy
   */
  getMetrics(strategyName: string, symbol?: string): StrategyMetrics | null {
    const key = this.config.strategySpecific && symbol
      ? `${strategyName}_${symbol}`
      : strategyName;
    
    return this.metrics.get(key) || null;
  }

  /**
   * Get all current metrics
   */
  getAllMetrics(): StrategyMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get performance summary for logging/monitoring
   */
  getPerformanceSummary(): {
    totalStrategies: number;
    positiveExpectancy: number;
    negativeExpectancy: number;
    averageExpectancy: number;
    topPerformers: StrategyMetrics[];
    bottomPerformers: StrategyMetrics[];
  } {
    const allMetrics = this.getAllMetrics();
    const positiveExpectancy = allMetrics.filter(m => m.expectancy > 0).length;
    const negativeExpectancy = allMetrics.filter(m => m.expectancy < 0).length;
    
    const averageExpectancy = allMetrics.length > 0 
      ? allMetrics.reduce((sum, m) => sum + m.expectancy, 0) / allMetrics.length
      : 0;

    // Sort by expectancy for top/bottom performers
    const sortedMetrics = [...allMetrics].sort((a, b) => b.expectancy - a.expectancy);
    
    return {
      totalStrategies: allMetrics.length,
      positiveExpectancy,
      negativeExpectancy,
      averageExpectancy,
      topPerformers: sortedMetrics.slice(0, 3),
      bottomPerformers: sortedMetrics.slice(-3).reverse()
    };
  }

  /**
   * Refresh metrics from database (periodic update)
   */
  async refreshMetrics(): Promise<void> {
    const now = Date.now();
    if (now - this.lastUpdateTime < this.updateInterval) {
      return; // Skip if updated recently
    }

    logger.info("🔄 EXPECTANCY: Refreshing metrics from database");
    await this.loadMetricsFromDatabase();
    this.lastUpdateTime = now;
  }
}

/**
 * Global expectancy manager instance
 */
export const expectancyManager = new ExpectancyManager(); 