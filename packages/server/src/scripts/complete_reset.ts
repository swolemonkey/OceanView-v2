import { prisma } from '../db.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('complete-reset');

interface CompleteResetReport {
  accountState: { cleared: number; reset: any };
  trades: { deleted: number };
  orders: { deleted: number };
  bots: { deleted: number };
  metrics: { deleted: number };
  strategyTrades: { deleted: number };
  portfolioMetrics: { deleted: number };
  dailyMetrics: { deleted: number };
  evolutionMetrics: { deleted: number };
  hyperSettings: { reset: any };
}

async function completeSystemReset(confirm: boolean = false): Promise<CompleteResetReport> {
  if (!confirm) {
    logger.warn('⚠️  WARNING: This will perform a COMPLETE SYSTEM RESET!');
    logger.warn('   - Clear ALL trade history');
    logger.warn('   - Clear ALL order history');
    logger.warn('   - Reset ALL bot states');
    logger.warn('   - Clear ALL strategy trades');
    logger.warn('   - Clear ALL portfolio metrics');
    logger.warn('   - Clear ALL daily metrics');
    logger.warn('   - Clear ALL evolution metrics');
    logger.warn('   - Reset account equity to $3,000');
    logger.warn('   - Reset HyperSettings to optimized values');
    logger.warn('');
    logger.warn('🔥 This action is COMPLETELY IRREVERSIBLE!');
    logger.warn('');
    logger.warn('Run with --confirm flag to proceed');
    throw new Error('Complete reset cancelled - confirmation required');
  }

  logger.info('🔄 Starting COMPLETE SYSTEM RESET...');

  // 1. Clear all trades
  const deletedTrades = await prisma.trade.deleteMany({});
  logger.info(`🗑️  Deleted ${deletedTrades.count} trade records`);

  // 2. Clear all orders
  const deletedOrders = await prisma.order.deleteMany({});
  logger.info(`🗑️  Deleted ${deletedOrders.count} order records`);

  // 3. Clear all strategy trades
  const deletedStrategyTrades = await prisma.strategyTrade.deleteMany({});
  logger.info(`🗑️  Deleted ${deletedStrategyTrades.count} strategy trade records`);

  // 4. Clear all portfolio metrics
  const deletedPortfolioMetrics = await prisma.portfolioMetric.deleteMany({});
  logger.info(`🗑️  Deleted ${deletedPortfolioMetrics.count} portfolio metric records`);

  // 5. Clear all daily metrics
  const deletedDailyMetrics = await prisma.dailyMetric.deleteMany({});
  logger.info(`🗑️  Deleted ${deletedDailyMetrics.count} daily metric records`);

  // 6. Clear all evolution metrics
  const deletedEvolutionMetrics = await prisma.evolutionMetric.deleteMany({});
  logger.info(`🗑️  Deleted ${deletedEvolutionMetrics.count} evolution metric records`);

  // 7. Clear bot metrics first (foreign key dependency)
  const deletedMetrics = await prisma.metric.deleteMany({});
  logger.info(`🗑️  Deleted ${deletedMetrics.count} bot metric records`);

  // 8. Reset all bots
  const deletedBots = await prisma.bot.deleteMany({});
  logger.info(`🗑️  Deleted ${deletedBots.count} bot records`);

  // 9. Create fresh bot with clean state
  const freshBot = await prisma.bot.create({
    data: {
      name: 'hypertrades',
      type: 'hypertrades',
      enabled: true,
      equity: 3000.0,
      pnlToday: 0.0
    }
  });
  logger.info(`🤖 Created fresh bot: ${freshBot.name} with $${freshBot.equity} equity`);

  // 10. Reset account state
  const startingEquity = 3000.00;
  const resetAccount = await prisma.accountState.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      equity: startingEquity
    },
    update: {
      equity: startingEquity
    }
  });
  logger.info(`💰 Reset account equity to $${startingEquity.toFixed(2)}`);

  // 11. Reset HyperSettings to optimized values
  const optimizedSettings = await prisma.hyperSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      smcThresh: 0.0012,
      rsiOS: 25,
      rsiOB: 75,
      riskPct: 0.5,
      maxDailyLoss: 0.05,
      maxOpenRisk: 0.08,
      atrMultiple: 2.0,
      atrPeriod: 14,
      gatekeeperThresh: 0.62,
      fastMAPeriod: 50,
      slowMAPeriod: 200,
      symbols: 'AAPL,TSLA,NVDA,X:BTCUSD',
      strategyParams: JSON.stringify({
        TrendFollowMA: { minTrendStrength: 0.6, confirmationPeriod: 3 },
        RangeBounce: { supportResistanceBuffer: 0.002, minBounceStrength: 0.4 },
        SMCReversal: { minRetrace: 0.5, confirmationCandles: 2 },
        MomentumScalp: { momentumThreshold: 0.8, quickExitEnabled: true }
      }),
      strategyToggle: JSON.stringify({
        TrendFollowMA: true,
        RangeBounce: true,
        SMCReversal: true,
        MomentumScalp: true
      }),
      smcMinRetrace: 0.5
    },
    update: {
      smcThresh: 0.0012,
      rsiOS: 25,
      rsiOB: 75,
      riskPct: 0.5,
      maxDailyLoss: 0.05,
      maxOpenRisk: 0.08,
      atrMultiple: 2.0,
      atrPeriod: 14,
      gatekeeperThresh: 0.62,
      fastMAPeriod: 50,
      slowMAPeriod: 200,
      symbols: 'AAPL,TSLA,NVDA,X:BTCUSD',
      strategyParams: JSON.stringify({
        TrendFollowMA: { minTrendStrength: 0.6, confirmationPeriod: 3 },
        RangeBounce: { supportResistanceBuffer: 0.002, minBounceStrength: 0.4 },
        SMCReversal: { minRetrace: 0.5, confirmationCandles: 2 },
        MomentumScalp: { momentumThreshold: 0.8, quickExitEnabled: true }
      }),
      strategyToggle: JSON.stringify({
        TrendFollowMA: true,
        RangeBounce: true,
        SMCReversal: true,
        MomentumScalp: true
      }),
      smcMinRetrace: 0.5
    }
  });
  logger.info(`⚙️  Reset HyperSettings with optimized parameters`);

  const report: CompleteResetReport = {
    accountState: { cleared: 1, reset: resetAccount },
    trades: { deleted: deletedTrades.count },
    orders: { deleted: deletedOrders.count },
    bots: { deleted: deletedBots.count },
    metrics: { deleted: deletedMetrics.count },
    strategyTrades: { deleted: deletedStrategyTrades.count },
    portfolioMetrics: { deleted: deletedPortfolioMetrics.count },
    dailyMetrics: { deleted: deletedDailyMetrics.count },
    evolutionMetrics: { deleted: deletedEvolutionMetrics.count },
    hyperSettings: { reset: optimizedSettings }
  };

  return report;
}

async function generateCompleteResetReport(report: CompleteResetReport): Promise<void> {
  logger.info('='.repeat(70));
  logger.info('🎯 COMPLETE SYSTEM RESET SUCCESSFUL');
  logger.info('='.repeat(70));

  logger.info('\n🗑️  DATA CLEANUP SUMMARY:');
  logger.info(`  Trades Deleted: ${report.trades.deleted}`);
  logger.info(`  Orders Deleted: ${report.orders.deleted}`);
  logger.info(`  Strategy Trades Deleted: ${report.strategyTrades.deleted}`);
  logger.info(`  Portfolio Metrics Deleted: ${report.portfolioMetrics.deleted}`);
  logger.info(`  Daily Metrics Deleted: ${report.dailyMetrics.deleted}`);
  logger.info(`  Evolution Metrics Deleted: ${report.evolutionMetrics.deleted}`);
  logger.info(`  Bot Metrics Deleted: ${report.metrics.deleted}`);
  logger.info(`  Bots Reset: ${report.bots.deleted}`);

  logger.info('\n💰 FRESH STATE CREATED:');
  logger.info(`  Account Equity: $${report.accountState.reset.equity.toFixed(2)}`);
  logger.info(`  Bot Equity: $3,000.00`);
  logger.info(`  Bot PnL Today: $0.00`);

  logger.info('\n⚙️  OPTIMIZED SETTINGS APPLIED:');
  logger.info(`  Risk Per Trade: 50% (reduced from 100%)`);
  logger.info(`  Max Daily Loss: 5%`);
  logger.info(`  Max Open Risk: 8%`);
  logger.info(`  SMC Threshold: 0.0012 (more selective)`);
  logger.info(`  RSI Levels: 25/75 (more selective)`);

  logger.info('\n✅ SYSTEM COMPLETELY RESET AND OPTIMIZED');
  logger.info('\n📋 NEXT STEPS:');
  logger.info('  1. Run a fresh backtest to validate clean state');
  logger.info('  2. Monitor for zero risk breaches');
  logger.info('  3. Verify all optimizations are working');
  logger.info('  4. Check for improved win rates and profitability');
}

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  
  try {
    logger.info('🔍 Initiating COMPLETE system reset...');
    const report = await completeSystemReset(confirm);
    
    await generateCompleteResetReport(report);
    
  } catch (error) {
    logger.error('❌ Error during complete reset:', error);
    process.exit(1);
  }
}

// Export for use in other scripts
export { completeSystemReset, generateCompleteResetReport };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => {
      console.log('\n✅ Complete system reset completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Error during complete reset:', error);
      process.exit(1);
    });
} 