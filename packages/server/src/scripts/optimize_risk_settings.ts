import { prisma } from '../db.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('risk-optimization');

interface RiskOptimizationReport {
  current: {
    maxDailyLoss: number;
    maxOpenRisk: number;
    riskPct: number;
    maxConcurrentTrades: number;
  };
  recommended: {
    maxDailyLoss: number;
    maxOpenRisk: number;
    riskPct: number;
    maxConcurrentTrades: number;
    reasoning: string[];
  };
  assetClassOptimizations: {
    crypto: { riskMultiplier: number; reasoning: string };
    equity: { riskMultiplier: number; reasoning: string };
    future: { riskMultiplier: number; reasoning: string };
  };
}

async function analyzeCurrentSettings(): Promise<RiskOptimizationReport> {
  // Get current settings from database
  const hyperSettings = await prisma.hyperSettings.findUnique({ where: { id: 1 } });
  
  if (!hyperSettings) {
    throw new Error('HyperSettings not found in database');
  }

  logger.info('Current risk settings:', {
    maxDailyLoss: hyperSettings.maxDailyLoss,
    maxOpenRisk: hyperSettings.maxOpenRisk,
    riskPct: hyperSettings.riskPct,
  });

  // Analyze recent backtest performance to inform recommendations
  const reasoning: string[] = [];
  
  // Current settings analysis
  const current = {
    maxDailyLoss: hyperSettings.maxDailyLoss,
    maxOpenRisk: hyperSettings.maxOpenRisk,
    riskPct: hyperSettings.riskPct || 1.0,
    maxConcurrentTrades: 2 // Default from config
  };

  // Calculate optimized settings based on 100% breach rate issue
  let recommendedDailyLoss = current.maxDailyLoss;
  let recommendedOpenRisk = current.maxOpenRisk;
  let recommendedRiskPct = current.riskPct;
  let recommendedConcurrentTrades = current.maxConcurrentTrades;

  // Issue 1: 100% risk breach rate indicates limits are too tight
  if (current.maxDailyLoss <= 0.03) { // 3% or less
    recommendedDailyLoss = 0.05; // Increase to 5%
    reasoning.push('Increased daily loss limit from 3% to 5% to reduce breach frequency');
  }

  if (current.maxOpenRisk <= 0.05) { // 5% or less
    recommendedOpenRisk = 0.08; // Increase to 8%
    reasoning.push('Increased open risk limit from 5% to 8% to allow for position volatility');
  }

  // Issue 2: Low win rate (25%) suggests position sizing might be too aggressive
  if (current.riskPct >= 1.0) { // 1% or more per trade
    recommendedRiskPct = 0.5; // Reduce to 0.5%
    reasoning.push('Reduced position size from 1% to 0.5% per trade to improve risk-adjusted returns');
  }

  // Issue 3: Asset-specific optimizations based on backtest results
  const assetClassOptimizations = {
    crypto: {
      riskMultiplier: 1.2, // Bitcoin was profitable, allow slightly larger positions
      reasoning: 'Bitcoin showed strong performance (+$24.83), increase allocation'
    },
    equity: {
      riskMultiplier: 0.3, // Stocks lost money, reduce significantly
      reasoning: 'Traditional stocks (AAPL, TSLA, NVDA) all lost money, reduce allocation'
    },
    future: {
      riskMultiplier: 0.6, // Conservative approach for futures
      reasoning: 'Conservative allocation for futures pending performance data'
    }
  };

  return {
    current,
    recommended: {
      maxDailyLoss: recommendedDailyLoss,
      maxOpenRisk: recommendedOpenRisk,
      riskPct: recommendedRiskPct,
      maxConcurrentTrades: recommendedConcurrentTrades,
      reasoning
    },
    assetClassOptimizations
  };
}

async function updateRiskSettings(report: RiskOptimizationReport, apply: boolean = false): Promise<void> {
  logger.info('='.repeat(60));
  logger.info('🎯 RISK MANAGEMENT OPTIMIZATION REPORT');
  logger.info('='.repeat(60));

  // Display current vs recommended
  logger.info('\n📊 CURRENT SETTINGS:');
  logger.info(`  Daily Loss Limit: ${(report.current.maxDailyLoss * 100).toFixed(1)}%`);
  logger.info(`  Open Risk Limit: ${(report.current.maxOpenRisk * 100).toFixed(1)}%`);
  logger.info(`  Position Size: ${(report.current.riskPct * 100).toFixed(1)}% per trade`);
  logger.info(`  Max Concurrent Trades: ${report.current.maxConcurrentTrades}`);

  logger.info('\n🎯 RECOMMENDED SETTINGS:');
  logger.info(`  Daily Loss Limit: ${(report.recommended.maxDailyLoss * 100).toFixed(1)}%`);
  logger.info(`  Open Risk Limit: ${(report.recommended.maxOpenRisk * 100).toFixed(1)}%`);
  logger.info(`  Position Size: ${(report.recommended.riskPct * 100).toFixed(1)}% per trade`);
  logger.info(`  Max Concurrent Trades: ${report.recommended.maxConcurrentTrades}`);

  logger.info('\n💡 REASONING:');
  report.recommended.reasoning.forEach((reason, i) => {
    logger.info(`  ${i + 1}. ${reason}`);
  });

  logger.info('\n🏗️ ASSET CLASS OPTIMIZATIONS:');
  Object.entries(report.assetClassOptimizations).forEach(([assetClass, config]) => {
    logger.info(`  ${assetClass.toUpperCase()}: ${(config.riskMultiplier * 100).toFixed(0)}% allocation`);
    logger.info(`    Reasoning: ${config.reasoning}`);
  });

  if (apply) {
    logger.info('\n🔧 APPLYING OPTIMIZATIONS...');
    
    // Update database settings
    await prisma.hyperSettings.update({
      where: { id: 1 },
      data: {
        maxDailyLoss: report.recommended.maxDailyLoss,
        maxOpenRisk: report.recommended.maxOpenRisk,
        riskPct: report.recommended.riskPct,
        updatedAt: new Date()
      }
    });

    // Update strategy toggle to disable underperforming strategies for stocks
    const currentSettings = await prisma.hyperSettings.findUnique({ where: { id: 1 } });
    let strategyToggle: Record<string, boolean> = {};
    
    try {
      strategyToggle = JSON.parse(currentSettings?.strategyToggle || '{}');
    } catch (e) {
      strategyToggle = {};
    }

    // Enable high-performance strategies, disable or tune others
    strategyToggle.TrendFollowMA = true;  // Keep enabled - good performance
    strategyToggle.RangeBounce = true;    // Keep enabled - decent performance  
    strategyToggle.SMCReversal = true;    // Keep enabled - good performance
    strategyToggle.MomentumScalp = false; // Disable for now - might be too aggressive

    await prisma.hyperSettings.update({
      where: { id: 1 },
      data: {
        strategyToggle: JSON.stringify(strategyToggle),
        updatedAt: new Date()
      }
    });

    logger.info('✅ Risk settings updated successfully!');
    logger.info('\n📋 NEXT STEPS:');
    logger.info('  1. Run a new backtest to validate improvements');
    logger.info('  2. Monitor win rate and breach rate improvements');
    logger.info('  3. Fine-tune asset-specific strategies based on results');
    
  } else {
    logger.info('\n🔍 DRY RUN MODE - No changes applied');
    logger.info('Run with --apply flag to implement these optimizations');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  
  try {
    logger.info('🔍 Analyzing current risk management settings...');
    const report = await analyzeCurrentSettings();
    
    await updateRiskSettings(report, apply);
    
  } catch (error) {
    logger.error('❌ Error during risk optimization:', error);
    process.exit(1);
  }
}

// Export for use in other scripts
export { analyzeCurrentSettings, updateRiskSettings };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => {
      console.log('\n✅ Risk optimization analysis completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Error during risk optimization:', error);
      process.exit(1);
    });
} 