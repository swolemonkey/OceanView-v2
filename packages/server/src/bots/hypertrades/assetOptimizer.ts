import { prisma } from '../../db.js';
import { createLogger } from '../../utils/logger.js';
import type { Config } from './config.js';

const logger = createLogger('assetOptimizer');

/**
 * Asset-specific optimization configuration
 */
export interface AssetOptimizationConfig {
  symbol: string;
  
  // Strategy parameters (null = use global default)
  smcThreshold?: number | null;
  rsiOversold?: number | null;
  rsiOverbought?: number | null;
  atrMultiplier?: number | null;
  riskMultiplier?: number | null;
  minHoldTimeMs?: number | null;
  trailingStopThreshold?: number | null;
  maxTradesPerHour?: number | null;
  cooldownMinutes?: number | null;
  
  // Strategy toggles (null = use global setting)
  enableSMCReversal?: boolean | null;
  enableTrendFollowMA?: boolean | null;
  enableRangeBounce?: boolean | null;
  enableMomentumScalp?: boolean | null;
  
  // Performance metrics
  winRate?: number | null;
  avgRR?: number | null;
  expectancy?: number | null;
  optimizationScore?: number | null;
  
  // Market adaptations
  volatilityAdjustment?: number | null;
  trendStrengthFilter?: number | null;
  
  // Timestamps (from database)
  lastOptimized?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Performance metrics for optimization scoring
 */
export interface AssetPerformanceMetrics {
  totalTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  sharpeRatio: number;
  maxDrawdown: number;
  profitFactor: number;
  avgRR: number;
  recentPerformance: number; // Last 30 days performance
}

/**
 * Asset Optimization Manager
 * Handles per-symbol parameter overrides and performance-based auto-tuning
 */
export class AssetOptimizer {
  private optimizationCache = new Map<string, AssetOptimizationConfig>();
  private performanceCache = new Map<string, AssetPerformanceMetrics>();
  private lastCacheUpdate = 0;
  private cacheExpiryMs = 5 * 60 * 1000; // 5 minutes

  /**
   * Get optimized configuration for a specific symbol
   * @param symbol Trading symbol
   * @param baseConfig Base configuration to override
   * @returns Symbol-specific optimized configuration
   */
  async getOptimizedConfig(symbol: string, baseConfig: Config): Promise<Config> {
    const optimization = await this.getAssetOptimization(symbol);
    
    if (!optimization) {
      // No optimization found, return base config
      return baseConfig;
    }

    // Apply symbol-specific overrides
    const optimizedConfig: Config = {
      ...baseConfig,
      
      // Override SMC parameters
      smc: {
        thresh: optimization.smcThreshold ?? baseConfig.smc.thresh,
        minRetrace: baseConfig.smc.minRetrace
      },
      
      // Override TA parameters
      ta: {
        ...baseConfig.ta,
        overSold: optimization.rsiOversold ?? baseConfig.ta.overSold,
        overBought: optimization.rsiOverbought ?? baseConfig.ta.overBought
      },
      
      // Override risk parameters
      riskPct: baseConfig.riskPct * (optimization.riskMultiplier ?? 1.0),
      
      // Override timing parameters
      maxTradesPerHour: optimization.maxTradesPerHour ?? baseConfig.maxTradesPerHour,
      cooldownMinutes: optimization.cooldownMinutes ?? baseConfig.cooldownMinutes,
      
      // Override strategy toggles if specified
      strategyToggle: {
        SMCReversal: optimization.enableSMCReversal ?? baseConfig.strategyToggle.SMCReversal ?? true,
        TrendFollowMA: optimization.enableTrendFollowMA ?? baseConfig.strategyToggle.TrendFollowMA ?? false,
        RangeBounce: optimization.enableRangeBounce ?? baseConfig.strategyToggle.RangeBounce ?? false,
        MomentumScalp: optimization.enableMomentumScalp ?? baseConfig.strategyToggle.MomentumScalp ?? false
      }
    };

    // Apply asset-class specific overrides if they exist
    if (optimization.minHoldTimeMs && baseConfig.minHoldTimes) {
      const assetClass = this.getAssetClass(symbol);
      baseConfig.minHoldTimes[assetClass] = optimization.minHoldTimeMs;
    }

    if (optimization.trailingStopThreshold && baseConfig.trailingStopThresholds) {
      const assetClass = this.getAssetClass(symbol);
      baseConfig.trailingStopThresholds[assetClass] = optimization.trailingStopThreshold;
    }

    logger.info(`🎯 ASSET OPTIMIZATION: Applied optimized config for ${symbol}`, {
      symbol,
      overrides: {
        smcThreshold: optimization.smcThreshold,
        rsiOversold: optimization.rsiOversold,
        rsiOverbought: optimization.rsiOverbought,
        riskMultiplier: optimization.riskMultiplier,
        strategiesEnabled: Object.entries(optimizedConfig.strategyToggle)
          .filter(([_, enabled]) => enabled)
          .map(([name, _]) => name)
      },
      performanceMetrics: {
        winRate: optimization.winRate,
        expectancy: optimization.expectancy,
        optimizationScore: optimization.optimizationScore
      }
    });

    return optimizedConfig;
  }

  /**
   * Update performance metrics and trigger auto-optimization if needed
   * @param symbol Trading symbol
   * @param tradeResult Recent trade result
   */
  async updatePerformanceAndOptimize(
    symbol: string, 
    tradeResult: { pnl: number; rr: number; duration: number }
  ): Promise<void> {
    try {
      // Update performance metrics
      await this.updatePerformanceMetrics(symbol, tradeResult);
      
      // Check if auto-optimization is due
      const optimization = await this.getAssetOptimization(symbol);
      const lastOptimized = optimization?.lastOptimized;
      const daysSinceOptimization = lastOptimized 
        ? (Date.now() - lastOptimized.getTime()) / (24 * 60 * 60 * 1000)
        : 30; // Assume 30 days if never optimized

      // Auto-optimize every 7 days or if performance is poor
      const performance = await this.getPerformanceMetrics(symbol);
      const shouldOptimize = daysSinceOptimization >= 7 || 
                           (performance && performance.expectancy < 0);

      if (shouldOptimize) {
        await this.autoOptimizeAsset(symbol);
      }

    } catch (error) {
      logger.error(`Failed to update performance for ${symbol}`, {
        symbol,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Auto-optimize parameters for a specific asset based on performance
   * @param symbol Trading symbol to optimize
   */
  async autoOptimizeAsset(symbol: string): Promise<void> {
    logger.info(`🔧 AUTO-OPTIMIZATION: Starting optimization for ${symbol}`, { symbol });

    try {
      const performance = await this.getPerformanceMetrics(symbol);
      if (!performance || performance.totalTrades < 20) {
        logger.warn(`Insufficient trade data for optimization`, { 
          symbol, 
          totalTrades: performance?.totalTrades || 0 
        });
        return;
      }

      // Generate optimization recommendations based on performance
      const recommendations = this.generateOptimizationRecommendations(symbol, performance);
      
      // Apply recommendations
      await this.applyOptimizations(symbol, recommendations);

      logger.info(`✅ AUTO-OPTIMIZATION: Completed optimization for ${symbol}`, {
        symbol,
        recommendations,
        previousScore: performance.recentPerformance,
        optimizationDate: new Date().toISOString()
      });

    } catch (error) {
      logger.error(`Auto-optimization failed for ${symbol}`, {
        symbol,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Generate optimization recommendations based on performance analysis
   */
  private generateOptimizationRecommendations(
    symbol: string, 
    performance: AssetPerformanceMetrics
  ): Partial<AssetOptimizationConfig> {
    const recommendations: Partial<AssetOptimizationConfig> = {};

    // Analyze win rate and adjust RSI levels
    if (performance.winRate < 0.45) {
      // Low win rate - make entries more selective
      recommendations.rsiOversold = Math.max(25, (recommendations.rsiOversold || 30) - 5);
      recommendations.rsiOverbought = Math.min(75, (recommendations.rsiOverbought || 70) + 5);
      logger.debug(`Low win rate detected, tightening RSI levels`, { symbol, winRate: performance.winRate });
    } else if (performance.winRate > 0.70) {
      // High win rate - can be more aggressive
      recommendations.rsiOversold = Math.min(35, (recommendations.rsiOversold || 30) + 3);
      recommendations.rsiOverbought = Math.max(65, (recommendations.rsiOverbought || 70) - 3);
      logger.debug(`High win rate detected, loosening RSI levels`, { symbol, winRate: performance.winRate });
    }

    // Analyze risk-reward and adjust risk sizing
    if (performance.avgRR < 1.2) {
      // Poor risk-reward - reduce position size
      recommendations.riskMultiplier = Math.max(0.5, (recommendations.riskMultiplier || 1.0) * 0.8);
      logger.debug(`Poor RR detected, reducing risk`, { symbol, avgRR: performance.avgRR });
    } else if (performance.avgRR > 2.0 && performance.winRate > 0.55) {
      // Good risk-reward with decent win rate - can increase size
      recommendations.riskMultiplier = Math.min(1.5, (recommendations.riskMultiplier || 1.0) * 1.1);
      logger.debug(`Good RR detected, increasing risk`, { symbol, avgRR: performance.avgRR });
    }

    // Analyze drawdown and adjust trade frequency
    if (performance.maxDrawdown > 0.15) {
      // High drawdown - reduce trade frequency
      recommendations.maxTradesPerHour = Math.max(2, (recommendations.maxTradesPerHour || 10) - 2);
      recommendations.cooldownMinutes = Math.min(60, (recommendations.cooldownMinutes || 15) + 10);
      logger.debug(`High drawdown detected, reducing frequency`, { symbol, maxDrawdown: performance.maxDrawdown });
    }

    // Strategy selection based on performance
    if (performance.expectancy < -0.001) {
      // Negative expectancy - disable underperforming strategies
      // This would require strategy-specific performance tracking
      logger.debug(`Negative expectancy detected, considering strategy adjustments`, { 
        symbol, 
        expectancy: performance.expectancy 
      });
    }

    return recommendations;
  }

  /**
   * Apply optimization recommendations to the database
   */
  private async applyOptimizations(
    symbol: string, 
    recommendations: Partial<AssetOptimizationConfig>
  ): Promise<void> {
    await prisma.assetOptimization.upsert({
      where: { symbol },
      update: {
        ...recommendations,
        lastOptimized: new Date(),
        updatedAt: new Date()
      },
      create: {
        symbol,
        ...recommendations,
        lastOptimized: new Date()
      }
    });

    // Clear cache to force reload
    this.optimizationCache.delete(symbol);
  }

  /**
   * Get asset optimization configuration from database
   */
  private async getAssetOptimization(symbol: string): Promise<AssetOptimizationConfig | null> {
    // Check cache first
    if (this.optimizationCache.has(symbol) && 
        Date.now() - this.lastCacheUpdate < this.cacheExpiryMs) {
      return this.optimizationCache.get(symbol) || null;
    }

    try {
      const optimization = await prisma.assetOptimization.findUnique({
        where: { symbol }
      });

      if (optimization) {
        const config: AssetOptimizationConfig = {
          symbol: optimization.symbol,
          smcThreshold: optimization.smcThreshold,
          rsiOversold: optimization.rsiOversold,
          rsiOverbought: optimization.rsiOverbought,
          atrMultiplier: optimization.atrMultiplier,
          riskMultiplier: optimization.riskMultiplier,
          minHoldTimeMs: optimization.minHoldTimeMs,
          trailingStopThreshold: optimization.trailingStopThreshold,
          maxTradesPerHour: optimization.maxTradesPerHour,
          cooldownMinutes: optimization.cooldownMinutes,
          enableSMCReversal: optimization.enableSMCReversal,
          enableTrendFollowMA: optimization.enableTrendFollowMA,
          enableRangeBounce: optimization.enableRangeBounce,
          enableMomentumScalp: optimization.enableMomentumScalp,
          winRate: optimization.winRate,
          avgRR: optimization.avgRR,
          expectancy: optimization.expectancy,
          optimizationScore: optimization.optimizationScore,
          volatilityAdjustment: optimization.volatilityAdjustment,
          trendStrengthFilter: optimization.trendStrengthFilter,
          lastOptimized: optimization.lastOptimized,
          createdAt: optimization.createdAt,
          updatedAt: optimization.updatedAt
        };

        this.optimizationCache.set(symbol, config);
        this.lastCacheUpdate = Date.now();
        return config;
      }

      return null;
    } catch (error) {
      logger.error(`Failed to load asset optimization for ${symbol}`, {
        symbol,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Calculate performance metrics for a symbol
   */
  private async getPerformanceMetrics(symbol: string): Promise<AssetPerformanceMetrics | null> {
    try {
      // Get recent trades (last 100 or 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const trades = await prisma.strategyTrade.findMany({
        where: {
          symbol,
          ts: { gte: thirtyDaysAgo }
        },
        orderBy: { ts: 'desc' },
        take: 100
      });

      if (trades.length < 5) {
        return null; // Insufficient data
      }

      // Calculate metrics
      const wins = trades.filter(t => t.pnl > 0);
      const losses = trades.filter(t => t.pnl < 0);
      
      const winRate = wins.length / trades.length;
      const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length) : 0;
      const expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss);
      
      // Calculate running PnL for drawdown
      let runningPnL = 0;
      let peak = 0;
      let maxDrawdown = 0;
      
      for (const trade of trades.reverse()) { // Chronological order
        runningPnL += trade.pnl;
        peak = Math.max(peak, runningPnL);
        const drawdown = (peak - runningPnL) / Math.max(peak, 1);
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      }

      const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
      const profitFactor = avgLoss > 0 ? (wins.length * avgWin) / (losses.length * avgLoss) : 0;
      
      // Approximate Sharpe ratio (simplified)
      const returns = trades.map(t => t.pnl);
      const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
      const sharpeRatio = Math.sqrt(variance) > 0 ? avgReturn / Math.sqrt(variance) : 0;

      // Calculate average risk-reward
      const avgRR = trades.length > 0 
        ? trades.reduce((sum, t) => sum + Math.abs(t.pnl), 0) / trades.length 
        : 0;

      return {
        totalTrades: trades.length,
        winRate,
        avgWin,
        avgLoss,
        expectancy,
        sharpeRatio,
        maxDrawdown,
        profitFactor,
        avgRR,
        recentPerformance: totalPnL
      };

    } catch (error) {
      logger.error(`Failed to calculate performance metrics for ${symbol}`, {
        symbol,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Update performance metrics after a trade
   */
  private async updatePerformanceMetrics(
    symbol: string, 
    tradeResult: { pnl: number; rr: number; duration: number }
  ): Promise<void> {
    // This would update running performance metrics
    // For now, we rely on the database queries in getPerformanceMetrics
    logger.debug(`Performance updated for ${symbol}`, {
      symbol,
      pnl: tradeResult.pnl,
      rr: tradeResult.rr,
      duration: tradeResult.duration
    });
  }

  /**
   * Determine asset class from symbol
   */
  private getAssetClass(symbol: string): 'crypto' | 'equity' | 'future' {
    const sym = symbol.toUpperCase();
    
    if (sym.startsWith('X:') || sym.includes('USD') || sym.includes('BTC') || sym.includes('ETH')) {
      return 'crypto';
    }
    
    const equitySymbols = ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'TSLA', 'META', 'NVDA', 'AMD', 'COIN', 'SHOP', 'GME', 'SQ'];
    if (equitySymbols.includes(sym)) {
      return 'equity';
    }
    
    return 'crypto';
  }

  /**
   * Get optimization summary for monitoring
   */
  async getOptimizationSummary(): Promise<{
    totalOptimizedAssets: number;
    recentOptimizations: number;
    topPerformers: Array<{ symbol: string; score: number; winRate: number }>;
    underPerformers: Array<{ symbol: string; expectancy: number; needsOptimization: boolean }>;
  }> {
    try {
      const optimizations = await prisma.assetOptimization.findMany({
        orderBy: { optimizationScore: 'desc' }
      });

      const recentOptimizations = optimizations.filter(
        opt => opt.lastOptimized && 
        Date.now() - opt.lastOptimized.getTime() < 7 * 24 * 60 * 60 * 1000
      ).length;

      const topPerformers = optimizations
        .filter(opt => opt.optimizationScore && opt.winRate)
        .slice(0, 5)
        .map(opt => ({
          symbol: opt.symbol,
          score: opt.optimizationScore!,
          winRate: opt.winRate!
        }));

      const underPerformers = optimizations
        .filter(opt => opt.expectancy && opt.expectancy < 0)
        .slice(0, 5)
        .map(opt => ({
          symbol: opt.symbol,
          expectancy: opt.expectancy!,
          needsOptimization: !opt.lastOptimized || 
            Date.now() - opt.lastOptimized.getTime() > 7 * 24 * 60 * 60 * 1000
        }));

      return {
        totalOptimizedAssets: optimizations.length,
        recentOptimizations,
        topPerformers,
        underPerformers
      };
    } catch (error) {
      logger.error('Failed to get optimization summary', {
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        totalOptimizedAssets: 0,
        recentOptimizations: 0,
        topPerformers: [],
        underPerformers: []
      };
    }
  }
}

// Global instance
export const assetOptimizer = new AssetOptimizer(); 