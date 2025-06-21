import { prisma } from '../db.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('db-inspector');

async function inspectDatabaseState() {
  logger.info('🔍 DATABASE STATE INSPECTION');
  logger.info('='.repeat(50));

  // Check AccountState
  const accounts = await prisma.accountState.findMany();
  logger.info('\n💰 ACCOUNT STATE:');
  if (accounts.length === 0) {
    logger.info('  No account records found');
  } else {
    accounts.forEach((account, i) => {
      logger.info(`  Account ${i + 1}: ID=${account.id}, Equity=$${account.equity.toFixed(2)}, Updated=${account.updated}`);
    });
  }

  // Check Trade count
  const tradeCount = await prisma.trade.count();
  logger.info(`\n📊 TRADES: ${tradeCount} records`);
  
  if (tradeCount > 0) {
    const recentTrades = await prisma.trade.findMany({
      take: 5,
      orderBy: { ts: 'desc' },
      select: { id: true, symbol: true, side: true, qty: true, price: true, pnl: true, ts: true }
    });
    
    logger.info('  Recent trades:');
    recentTrades.forEach(trade => {
      logger.info(`    ${trade.symbol} ${trade.side} ${trade.qty} @ $${trade.price} PnL: $${trade.pnl || 0} (${trade.ts})`);
    });
  }

  // Check Order count
  const orderCount = await prisma.order.count();
  logger.info(`\n📋 ORDERS: ${orderCount} records`);

  // Check Bot states
  const bots = await prisma.bot.findMany();
  logger.info(`\n🤖 BOTS: ${bots.length} records`);
  bots.forEach(bot => {
    logger.info(`  Bot: ${bot.name} (${bot.type}) - Equity: $${bot.equity}, PnL Today: $${bot.pnlToday}, Enabled: ${bot.enabled}`);
  });

  // Check HyperSettings
  const hyperSettings = await prisma.hyperSettings.findUnique({ where: { id: 1 } });
  logger.info('\n⚙️  HYPER SETTINGS:');
  if (hyperSettings) {
    logger.info(`  Risk %: ${hyperSettings.riskPct}`);
    logger.info(`  Max Daily Loss: ${hyperSettings.maxDailyLoss}`);
    logger.info(`  Max Open Risk: ${hyperSettings.maxOpenRisk}`);
    logger.info(`  SMC Threshold: ${hyperSettings.smcThresh}`);
    logger.info(`  RSI OS/OB: ${hyperSettings.rsiOS}/${hyperSettings.rsiOB}`);
  } else {
    logger.info('  No HyperSettings found');
  }

  // Check for any other tables that might have state
  const portfolioMetrics = await prisma.portfolioMetric.count();
  logger.info(`\n📈 PORTFOLIO METRICS: ${portfolioMetrics} records`);

  const dailyMetrics = await prisma.dailyMetric.count();
  logger.info(`📊 DAILY METRICS: ${dailyMetrics} records`);

  const evolutionMetrics = await prisma.evolutionMetric.count();
  logger.info(`🧬 EVOLUTION METRICS: ${evolutionMetrics} records`);

  // Check for any remaining data
  const strategyTrades = await prisma.strategyTrade.count();
  logger.info(`📋 STRATEGY TRADES: ${strategyTrades} records`);

  logger.info('\n' + '='.repeat(50));
  logger.info('🎯 INSPECTION COMPLETE');
}

async function main() {
  try {
    await inspectDatabaseState();
  } catch (error) {
    logger.error('❌ Error during database inspection:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => {
      console.log('\n✅ Database inspection completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Error during database inspection:', error);
      process.exit(1);
    });
} 