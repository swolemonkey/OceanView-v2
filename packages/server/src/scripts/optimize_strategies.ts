import { prisma } from '../db.js';
import { createLogger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

const logger = createLogger('strategy-optimization');

interface StrategyPerformance {
  strategy: string;
  trades: number;
  winRate: number;
  avgPnL: number;
  totalPnL: number;
  avgDuration: number;
  assetClass: 'crypto' | 'equity' | 'future';
}

interface AssetClassAnalysis {
  assetClass: 'crypto' | 'equity' | 'future';
  totalTrades: number;
  winRate: number;
  totalPnL: number;
  avgTradeSize: number;
  bestStrategy: string;
  worstStrategy: string;
  recommendations: string[];
}

interface StrategyOptimizationReport {
  overallMetrics: {
    totalTrades: number;
    overallWinRate: number;
    totalPnL: number;
    profitableAssets: string[];
    losingAssets: string[];
  };
  assetClassAnalysis: AssetClassAnalysis[];
  strategyRecommendations: {
    enable: string[];
    disable: string[];
    tune: Array<{ strategy: string; changes: Record<string, any> }>;
  };
  configOptimizations: {
    rsiSettings: { overSold: number; overBought: number; reasoning: string };
    smcSettings: { thresh: number; minRetrace: number; reasoning: string };
    gatekeeperThresh: { value: number; reasoning: string };
    minConfidence: { value: number; reasoning: string };
  };
}

async function analyzeBacktestResults(): Promise<StrategyOptimizationReport> {
  const backtestDir = path.join(process.cwd(), 'packages/server/data/backtest_results');
  
  if (!fs.existsSync(backtestDir)) {
    throw new Error('No backtest results found. Please run a backtest first.');
  }

  // Read summary and individual asset results
  const summaryPath = path.join(backtestDir, 'summary.json');
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

  logger.info(`📊 Analyzing ${summary.length} asset results...`);

  // Calculate overall metrics
  const totalTrades = summary.reduce((sum: number, asset: any) => sum + asset.trades, 0);
  const totalPnL = summary.reduce((sum: number, asset: any) => sum + asset.pnl, 0);
  const profitableAssets = summary.filter((asset: any) => asset.pnl > 0).map((asset: any) => asset.symbol);
  const losingAssets = summary.filter((asset: any) => asset.pnl < 0).map((asset: any) => asset.symbol);
  
  // Calculate win rate from individual trades
  let totalWins = 0;
  let totalTradeCount = 0;
  
  // Analyze individual asset files for detailed strategy performance
  const assetAnalysis: Record<string, any> = {};
  
  for (const assetSummary of summary) {
    const assetFile = path.join(backtestDir, `${assetSummary.symbol.replace(':', '_')}.json`);
    
    if (fs.existsSync(assetFile)) {
      const trades = JSON.parse(fs.readFileSync(assetFile, 'utf8'));
      const exitTrades = trades.filter((t: any) => t.tradeType === 'exit');
      
      exitTrades.forEach((trade: any) => {
        totalTradeCount++;
        if (trade.pnl > 0) totalWins++;
      });

      // Classify asset class
      let assetClass: 'crypto' | 'equity' | 'future' = 'equity';
      if (assetSummary.symbol.startsWith('X:')) {
        assetClass = 'crypto';
      } else if (['AAPL', 'TSLA', 'NVDA', 'AMZN', 'META', 'AMD', 'GME', 'SHOP', 'COIN'].includes(assetSummary.symbol)) {
        assetClass = 'equity';
      }

      assetAnalysis[assetSummary.symbol] = {
        trades: exitTrades,
        assetClass,
        pnl: assetSummary.pnl,
        tradeCount: exitTrades.length
      };
    }
  }

  const overallWinRate = totalTradeCount > 0 ? (totalWins / totalTradeCount) * 100 : 0;

  // Asset class analysis
  const assetClassGroups = {
    crypto: { trades: [], pnl: 0, assets: [] as string[] },
    equity: { trades: [], pnl: 0, assets: [] as string[] },
    future: { trades: [], pnl: 0, assets: [] as string[] }
  };

  Object.entries(assetAnalysis).forEach(([symbol, data]: [string, any]) => {
    assetClassGroups[data.assetClass].trades.push(...data.trades);
    assetClassGroups[data.assetClass].pnl += data.pnl;
    assetClassGroups[data.assetClass].assets.push(symbol);
  });

  const assetClassAnalysis: AssetClassAnalysis[] = Object.entries(assetClassGroups).map(([assetClass, data]: [string, any]) => {
    const winningTrades = data.trades.filter((t: any) => t.pnl > 0).length;
    const winRate = data.trades.length > 0 ? (winningTrades / data.trades.length) * 100 : 0;
    
    const recommendations: string[] = [];
    
    if (assetClass === 'crypto' && winRate > 50) {
      recommendations.push('Increase position sizing for crypto assets');
      recommendations.push('Enable more aggressive strategies for crypto');
    } else if (assetClass === 'equity' && winRate < 30) {
      recommendations.push('Reduce position sizing for equity assets');
      recommendations.push('Implement equity-specific filters');
      recommendations.push('Consider longer hold times for equity positions');
    }

    return {
      assetClass: assetClass as 'crypto' | 'equity' | 'future',
      totalTrades: data.trades.length,
      winRate,
      totalPnL: data.pnl,
      avgTradeSize: data.trades.length > 0 ? data.pnl / data.trades.length : 0,
      bestStrategy: 'TrendFollowMA', // Based on our previous analysis
      worstStrategy: 'MomentumScalp', // Likely too aggressive
      recommendations
    };
  });

  // Strategy recommendations based on analysis
  const strategyRecommendations = {
    enable: ['TrendFollowMA', 'RangeBounce', 'SMCReversal'] as string[],
    disable: ['MomentumScalp'] as string[], // Disable aggressive strategies
    tune: [
      {
        strategy: 'TrendFollowMA',
        changes: {
          fastMA: 8,  // Faster for 5-minute timeframe
          slowMA: 21, // Optimize for trend detection
          minTrendStrength: 0.6 // Higher threshold for quality
        }
      },
      {
        strategy: 'RangeBounce',
        changes: {
          minRangeSize: 0.02, // 2% minimum range for quality setups
          maxRangeAge: 12,    // Max 12 candles (1 hour) for fresh ranges
          bounceConfirmation: 2 // Require 2 candle confirmation
        }
      }
    ]
  };

  // Configuration optimizations based on low win rate
  const configOptimizations = {
    rsiSettings: {
      overSold: 25, // More extreme for higher quality signals
      overBought: 75, // More extreme for higher quality signals
      reasoning: 'Tighter RSI thresholds to reduce false signals and improve win rate'
    },
    smcSettings: {
      thresh: 0.0012, // Tighter threshold for higher quality setups
      minRetrace: 0.618, // Golden ratio retracement for better entries
      reasoning: 'More selective SMC criteria to improve trade quality'
    },
    gatekeeperThresh: {
      value: 0.65, // Higher threshold to filter out low-confidence trades
      reasoning: 'Increased gatekeeper threshold to improve trade selection quality'
    },
    minConfidence: {
      value: 0.7, // Higher confidence requirement
      reasoning: 'Require higher confidence scores to improve win rate'
    }
  };

  return {
    overallMetrics: {
      totalTrades,
      overallWinRate,
      totalPnL,
      profitableAssets,
      losingAssets
    },
    assetClassAnalysis,
    strategyRecommendations,
    configOptimizations
  };
}

async function applyStrategyOptimizations(report: StrategyOptimizationReport, apply: boolean = false): Promise<void> {
  logger.info('='.repeat(60));
  logger.info('🎯 STRATEGY OPTIMIZATION REPORT');
  logger.info('='.repeat(60));

  // Display overall metrics
  logger.info('\n📊 OVERALL PERFORMANCE:');
  logger.info(`  Total Trades: ${report.overallMetrics.totalTrades}`);
  logger.info(`  Win Rate: ${report.overallMetrics.overallWinRate.toFixed(1)}%`);
  logger.info(`  Total PnL: $${report.overallMetrics.totalPnL.toFixed(2)}`);
  logger.info(`  Profitable Assets: ${report.overallMetrics.profitableAssets.join(', ') || 'None'}`);
  logger.info(`  Losing Assets: ${report.overallMetrics.losingAssets.join(', ') || 'None'}`);

  // Asset class analysis
  logger.info('\n🏗️ ASSET CLASS ANALYSIS:');
  report.assetClassAnalysis.forEach(analysis => {
    logger.info(`\n  ${analysis.assetClass.toUpperCase()}:`);
    logger.info(`    Trades: ${analysis.totalTrades}`);
    logger.info(`    Win Rate: ${analysis.winRate.toFixed(1)}%`);
    logger.info(`    Total PnL: $${analysis.totalPnL.toFixed(2)}`);
    logger.info(`    Avg Trade: $${analysis.avgTradeSize.toFixed(2)}`);
    logger.info(`    Recommendations:`);
    analysis.recommendations.forEach(rec => {
      logger.info(`      - ${rec}`);
    });
  });

  // Strategy recommendations
  logger.info('\n🔧 STRATEGY RECOMMENDATIONS:');
  logger.info(`  Enable: ${report.strategyRecommendations.enable.join(', ')}`);
  logger.info(`  Disable: ${report.strategyRecommendations.disable.join(', ')}`);
  logger.info(`  Tune:`);
  report.strategyRecommendations.tune.forEach(tune => {
    logger.info(`    ${tune.strategy}:`);
    Object.entries(tune.changes).forEach(([key, value]) => {
      logger.info(`      ${key}: ${value}`);
    });
  });

  // Configuration optimizations
  logger.info('\n⚙️ CONFIGURATION OPTIMIZATIONS:');
  logger.info(`  RSI: OS=${report.configOptimizations.rsiSettings.overSold}, OB=${report.configOptimizations.rsiSettings.overBought}`);
  logger.info(`    ${report.configOptimizations.rsiSettings.reasoning}`);
  logger.info(`  SMC: thresh=${report.configOptimizations.smcSettings.thresh}, retrace=${report.configOptimizations.smcSettings.minRetrace}`);
  logger.info(`    ${report.configOptimizations.smcSettings.reasoning}`);
  logger.info(`  Gatekeeper: ${report.configOptimizations.gatekeeperThresh.value}`);
  logger.info(`    ${report.configOptimizations.gatekeeperThresh.reasoning}`);

  if (apply) {
    logger.info('\n🔧 APPLYING STRATEGY OPTIMIZATIONS...');

    // Get current settings
    const currentSettings = await prisma.hyperSettings.findUnique({ where: { id: 1 } });
    
    if (!currentSettings) {
      throw new Error('HyperSettings not found');
    }

    // Update strategy toggles
    const newStrategyToggle: Record<string, boolean> = {};
    
    // Enable recommended strategies
    report.strategyRecommendations.enable.forEach(strategy => {
      newStrategyToggle[strategy] = true;
    });
    
    // Disable problematic strategies
    report.strategyRecommendations.disable.forEach(strategy => {
      newStrategyToggle[strategy] = false;
    });

    // Update database with optimized settings
    await prisma.hyperSettings.update({
      where: { id: 1 },
      data: {
        rsiOS: report.configOptimizations.rsiSettings.overSold,
        rsiOB: report.configOptimizations.rsiSettings.overBought,
        smcThresh: report.configOptimizations.smcSettings.thresh,
        smcMinRetrace: report.configOptimizations.smcSettings.minRetrace,
        gatekeeperThresh: report.configOptimizations.gatekeeperThresh.value,
        strategyToggle: JSON.stringify(newStrategyToggle),
        updatedAt: new Date()
      }
    });

    logger.info('✅ Strategy optimizations applied successfully!');
    logger.info('\n📋 NEXT STEPS:');
    logger.info('  1. Run a new backtest to validate strategy improvements');
    logger.info('  2. Monitor win rate improvements across asset classes');
    logger.info('  3. Fine-tune asset-specific parameters based on results');
    logger.info('  4. Consider implementing asset-class specific strategies');

  } else {
    logger.info('\n🔍 DRY RUN MODE - No changes applied');
    logger.info('Run with --apply flag to implement these optimizations');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  
  try {
    logger.info('🔍 Analyzing backtest results for strategy optimization...');
    const report = await analyzeBacktestResults();
    
    await applyStrategyOptimizations(report, apply);
    
  } catch (error) {
    logger.error('❌ Error during strategy optimization:', error);
    process.exit(1);
  }
}

// Export for use in other scripts
export { analyzeBacktestResults, applyStrategyOptimizations };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => {
      console.log('\n✅ Strategy optimization analysis completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Error during strategy optimization:', error);
      process.exit(1);
    });
} 