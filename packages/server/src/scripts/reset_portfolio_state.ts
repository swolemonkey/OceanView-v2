import { prisma } from '../db.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('portfolio-reset');

interface PortfolioResetReport {
  accountState: {
    before: any;
    after: any;
  };
  trades: {
    deletedCount: number;
    affectedAssets: string[];
  };
  positions: {
    deletedCount: number;
    affectedAssets: string[];
  };
  metrics: {
    resetCount: number;
  };
}

async function resetPortfolioState(confirm: boolean = false): Promise<PortfolioResetReport> {
  if (!confirm) {
    logger.warn('⚠️  WARNING: This will reset ALL portfolio data!');
    logger.warn('   - Clear all trade history');
    logger.warn('   - Reset account equity to starting balance');
    logger.warn('   - Clear all open positions');
    logger.warn('   - Reset daily PnL to $0.00');
    logger.warn('   - Clear all performance metrics');
    logger.warn('');
    logger.warn('🔥 This action is IRREVERSIBLE!');
    logger.warn('');
    logger.warn('Run with --confirm flag to proceed');
    throw new Error('Portfolio reset cancelled - confirmation required');
  }

  logger.info('🔄 Starting portfolio state reset...');

  // Get current account state
  const currentAccount = await prisma.accountState.findUnique({ where: { id: 1 } });
  
  if (!currentAccount) {
    logger.warn('No existing account state found. Creating fresh account...');
  }

  // Clear all trades
  const deletedTrades = await prisma.trade.deleteMany({});
  logger.info(`🗑️  Deleted ${deletedTrades.count} trade records`);

  // Clear all orders (positions are tracked through orders/trades)
  const deletedOrders = await prisma.order.deleteMany({});
  logger.info(`🗑️  Deleted ${deletedOrders.count} order records`);

  // Get list of affected assets from recent activity
  const affectedAssets = await prisma.trade.groupBy({
    by: ['symbol'],
    _count: { symbol: true }
  });

  // Reset account state to fresh starting balance
  const startingEquity = 3000.00; // Starting balance
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

  // Reset any cached metrics or state in other tables
  const resetDailyMetrics = await prisma.dailyMetric.deleteMany({});
  logger.info(`📊 Cleared ${resetDailyMetrics.count} daily metrics`);

  // Clear any evolution data that might be stale
  const resetEvolution = await prisma.evolutionMetric.deleteMany({});
  logger.info(`🧬 Cleared ${resetEvolution.count} evolution metrics`);

  const report: PortfolioResetReport = {
    accountState: {
      before: currentAccount,
      after: resetAccount
    },
    trades: {
      deletedCount: deletedTrades.count,
      affectedAssets: affectedAssets.map(a => a.symbol)
    },
    positions: {
      deletedCount: deletedOrders.count,
      affectedAssets: affectedAssets.map(a => a.symbol)
    },
    metrics: {
      resetCount: resetDailyMetrics.count + resetEvolution.count
    }
  };

  return report;
}

async function generateResetReport(report: PortfolioResetReport): Promise<void> {
  logger.info('='.repeat(60));
  logger.info('🎯 PORTFOLIO RESET COMPLETE');
  logger.info('='.repeat(60));

  logger.info('\n💰 ACCOUNT STATE RESET:');
  if (report.accountState.before) {
    logger.info(`  Previous Equity: $${report.accountState.before.equity?.toFixed(2) || '0.00'}`);
    logger.info(`  Previous Day PnL: $${report.accountState.before.dayPnL?.toFixed(2) || '0.00'}`);
    logger.info(`  Previous Total PnL: $${report.accountState.before.totalPnL?.toFixed(2) || '0.00'}`);
  } else {
    logger.info('  No previous account state found');
  }
  
  logger.info(`  New Equity: $${report.accountState.after.equity.toFixed(2)}`);
  logger.info(`  New Day PnL: $${report.accountState.after.dayPnL.toFixed(2)}`);
  logger.info(`  New Total PnL: $${report.accountState.after.totalPnL.toFixed(2)}`);

  logger.info('\n🗑️  DATA CLEANUP:');
  logger.info(`  Trades Deleted: ${report.trades.deletedCount}`);
  logger.info(`  Positions Deleted: ${report.positions.deletedCount}`);
  logger.info(`  Metrics Cleared: ${report.metrics.resetCount}`);

  if (report.trades.affectedAssets.length > 0) {
    logger.info(`  Affected Assets: ${report.trades.affectedAssets.join(', ')}`);
  }

  logger.info('\n✅ PORTFOLIO STATE SUCCESSFULLY RESET');
  logger.info('\n📋 NEXT STEPS:');
  logger.info('  1. Run a fresh backtest to validate clean state');
  logger.info('  2. Monitor risk breach rates with new settings');
  logger.info('  3. Verify trade generation with optimized strategies');
  logger.info('  4. Check for any remaining configuration issues');
}

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  
  try {
    logger.info('🔍 Initiating portfolio state reset...');
    const report = await resetPortfolioState(confirm);
    
    await generateResetReport(report);
    
  } catch (error) {
    logger.error('❌ Error during portfolio reset:', error);
    process.exit(1);
  }
}

// Export for use in other scripts
export { resetPortfolioState, generateResetReport };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => {
      console.log('\n✅ Portfolio reset completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Error during portfolio reset:', error);
      process.exit(1);
    });
} 