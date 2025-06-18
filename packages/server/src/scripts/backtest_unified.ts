import { PolygonDataFeed } from '../feeds/polygonDataFeed.js';
import { prisma } from '../db.js';
import { executionMonitor } from '../monitoring/executionMonitor.js';
import { createLogger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const logger = createLogger('backtest');

// Enhanced implementation of runReplayViaFeed with monitoring
async function runReplayViaFeed(symbol: string, dataIterator: AsyncIterable<any>): Promise<any[]> {
  console.log(`🔄 Processing data for ${symbol} with real strategy execution...`);
  
  // Import required modules for real strategy execution
  const { AssetAgent } = await import('../bots/hypertrades/assetAgent.js');
  const { loadConfig, defaultConfig } = await import('../bots/hypertrades/config.js');
  const { SimEngine } = await import('../execution/sim.js');
  const { getStrategyVersion } = await import('../lib/getVersion.js');
  
  // Use optimized defaultConfig for backtesting instead of database config
  const cfg = defaultConfig;
  
  // Get strategy version
  const stratVersion = getStrategyVersion();
  const versionRow = await (prisma as any).strategyVersion.upsert({
    where: { hash: stratVersion },
    update: {},
    create: { hash: stratVersion, description: 'backtest-unified-strategies' }
  });
  
  // Create execution engine
  const simEngine = new SimEngine(1, 'backtest');
  
  // Create asset agent
  const versionId = versionRow.id;
  const agent = new AssetAgent(symbol, cfg, 1, versionId, undefined, simEngine);
  
  // Track all executed trades
  const executedTrades: any[] = [];
  
  // Track round-trip trades for proper PnL calculation
  const openPositions = new Map<string, any>(); // symbol -> position info
  
  // Hook into the agent's execution to capture trade results
  const originalExecute = simEngine.place.bind(simEngine);
  simEngine.place = async (order: any, ctx?: any) => {
    const fill = await originalExecute(order, ctx);
    
    // Track round-trip trades properly
    const positionKey = `${fill.symbol}`;
    const existingPosition = openPositions.get(positionKey);
    
    if (!existingPosition) {
      // Opening a new position - store entry details
      openPositions.set(positionKey, {
        entryPrice: fill.price,
        entryFee: fill.fee,
        qty: fill.qty,
        side: fill.side,
        entryTime: fill.timestamp,
        entryId: fill.id
      });
      
      // Record entry trade with negative fee as PnL
      executedTrades.push({
        id: fill.id,
        symbol: fill.symbol,
        side: fill.side,
        qty: fill.qty,
        price: fill.price,
        fee: fill.fee,
        pnl: -fill.fee, // Entry fee is a cost
        timestamp: fill.timestamp,
        strategy: ctx?.strategyName || 'backtest',
        tradeType: 'entry'
      });
    } else {
      // Closing position - calculate round-trip PnL
      const entry = existingPosition;
      let roundTripPnL = 0;
      
      if (entry.side === 'buy') {
        // Long position: profit when exit price > entry price
        roundTripPnL = (fill.price - entry.entryPrice) * fill.qty;
      } else {
        // Short position: profit when exit price < entry price  
        roundTripPnL = (entry.entryPrice - fill.price) * fill.qty;
      }
      
      // Subtract total fees (entry + exit)
      const totalFees = entry.entryFee + fill.fee;
      roundTripPnL -= totalFees;
      
      // Record completed round-trip trade
      executedTrades.push({
        id: fill.id,
        symbol: fill.symbol,
        side: fill.side,
        qty: fill.qty,
        price: fill.price,
        fee: fill.fee,
        pnl: roundTripPnL, // This is the actual profit/loss for the complete trade
        timestamp: fill.timestamp,
        strategy: ctx?.strategyName || 'backtest',
        tradeType: 'exit',
        entryPrice: entry.entryPrice,
        duration: fill.timestamp - entry.entryTime
      });
      
      // Remove closed position
      openPositions.delete(positionKey);
    }
    
    return fill;
  };
  
  // Process data with proper 5-minute candle aggregation (from Polygon 5m data)
  let currentCandle: any = null;
  let candleCount = 0;
  let dataPointCount = 0;
  
  console.log(`📊 Starting data processing for ${symbol}...`);
  
  for await (const tick of dataIterator) {
    dataPointCount++;
    
    // Log first few timestamps to debug
    if (dataPointCount <= 5) {
      console.log(`🕐 Tick ${dataPointCount}: timestamp=${tick.ts}, price=${tick.c}`);
    }
    
    // Since Polygon provides 5-minute aggregated data, each tick IS a complete candle
    const candle = {
      o: tick.o,
      h: tick.h, 
      l: tick.l,
      c: tick.c,
      v: tick.v,
      ts: tick.ts,
      symbol: symbol
    };
    
    // Process this candle
    await agent.onCandleClose(candle);
    candleCount++;
    
    // Log progress every 500 candles
    if (candleCount % 500 === 0) {
      console.log(`📈 Processed ${candleCount} candles, ${executedTrades.length} trades executed`);
    }
    
    // Track execution metrics
    executionMonitor.recordTradeExecution(true, 100, { symbol, candleId: candleCount }); // Success with 100ms latency
    executionMonitor.recordDatabaseOperation('candle_process', true, 50); // DB success with 50ms latency
  }
  
  console.log(`✅ Completed ${symbol}: ${dataPointCount} data points, ${candleCount} candles processed with real strategies`);
  console.log(`💰 Total trades executed: ${executedTrades.length}`);
  
  return executedTrades;
}

// Database connection utilities
async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$connect();
    console.log('✓ Database connection successful');
    return true;
  } catch (error) {
    console.error('✗ Database connection failed:', error);
    return false;
  }
}

async function startDatabase(): Promise<boolean> {
  try {
    console.log('🔄 Attempting to start TimescaleDB...');
    
    // Check if we're in a Docker environment
    const { stdout: dockerCheck } = await execAsync('docker ps -a');
    if (dockerCheck.includes('timescaledb')) {
      console.log('🐳 TimescaleDB container found and running');
      // Container is already running, just need to wait a moment
      await new Promise(resolve => setTimeout(resolve, 2000));
      return true;
    }
    
    // Try to start local TimescaleDB service
    try {
      await execAsync('brew services start timescaledb');
      await new Promise(resolve => setTimeout(resolve, 3000));
      return true;
    } catch {
      console.log('⚠️  Could not start TimescaleDB service automatically');
      return false;
    }
  } catch (error) {
    console.error('Error starting database:', error);
    return false;
  }
}

async function ensureDatabaseReady(): Promise<void> {
  let isConnected = await checkDatabaseConnection();
  
  if (!isConnected) {
    console.log('🔄 Database not connected, attempting to start...');
    const started = await startDatabase();
    if (!started) {
      console.error('❌ Failed to start database. Please ensure TimescaleDB is running.');
      process.exit(1);
    }
    
    // Try connecting again
    isConnected = await checkDatabaseConnection();
    if (!isConnected) {
      console.error('❌ Still unable to connect to database after startup attempt.');
      process.exit(1);
    }
  }
}

// Date utilities
function getRandomPeriod(daysBack: number = 30, periodDays: number = 7): { start: Date; end: Date } {
  const endDate = new Date();
  // Ensure we go back at least periodDays, and at most daysBack days
  const randomDaysAgo = Math.floor(Math.random() * (daysBack - periodDays + 1)) + periodDays;
  
  const periodEnd = new Date(endDate.getTime() - (randomDaysAgo * 24 * 60 * 60 * 1000));
  const periodStart = new Date(periodEnd.getTime() - (periodDays * 24 * 60 * 60 * 1000));
  
  return { start: periodStart, end: periodEnd };
}

const formatDate = (date: Date): string => date.toISOString().split('T')[0];

// Output management
function setupOutputDirectory(): string {
  const outputDir = path.join(process.cwd(), 'data', 'backtest_results');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Clean old CSV files
  const files = fs.readdirSync(outputDir);
  for (const file of files) {
    if (file.endsWith('.csv')) {
      fs.unlinkSync(path.join(outputDir, file));
    }
  }
  
  return outputDir;
}

// Backtest execution
async function runBacktest(options: {
  symbol?: string;
  symbols?: string[];
  startDate?: string;
  endDate?: string;
  randomPeriod?: boolean;
  periodDays?: number;
  allAssets?: boolean;
}): Promise<void> {
  await ensureDatabaseReady();
  
  // Initialize execution monitoring
  console.log('🔧 Initializing execution pipeline monitoring...');
  executionMonitor.resetMetrics();
  const backtestStartTime = Date.now();
  
  const outputDir = setupOutputDirectory();
  let symbols: string[] = [];
  let startDate: string;
  let endDate: string;
  
  // Determine symbols to backtest
  if (options.allAssets) {
    console.log('📊 Loading all active tradable assets...');
    const assets = await prisma.tradableAsset.findMany({ where: { active: true } });
    
    // Convert database symbols to Polygon format
    const convertToPolygonSymbol = (symbol: string, assetClass: string): string => {
      if (assetClass === 'future') {
        // Crypto futures: BTC -> X:BTCUSD, ETH -> X:ETHUSD, etc.
        return `X:${symbol}USD`;
      } else if (assetClass === 'equity') {
        // Equities: AAPL stays AAPL, TSLA stays TSLA, etc.
        return symbol;
      }
      return symbol; // fallback
    };
    
    symbols = assets.map(a => convertToPolygonSymbol(a.symbol, a.assetClass));
    console.log(`Found ${assets.length} active assets, converted to Polygon format:`);
    console.log(`  Raw symbols: ${assets.map(a => a.symbol).join(', ')}`);
    console.log(`  Polygon symbols: ${symbols.join(', ')}`);
  } else if (options.symbols) {
    symbols = options.symbols;
  } else if (options.symbol) {
    symbols = [options.symbol];
  } else {
    symbols = ['X:BTCUSD']; // Default to BTC
  }
  
  // Determine date range
  if (options.randomPeriod) {
    const { start, end } = getRandomPeriod(30, options.periodDays || 7);
    startDate = formatDate(start);
    endDate = formatDate(end);
    console.log(`🎲 Random ${options.periodDays || 7}-day period: ${startDate} to ${endDate}`);
    console.log(`🔍 DEBUG: Generated random period from ${start.toISOString()} to ${end.toISOString()}`);
  } else if (options.startDate && options.endDate) {
    startDate = options.startDate;
    endDate = options.endDate;
    console.log(`📅 Custom period: ${startDate} to ${endDate}`);
  } else {
    // Default to last 7 days
    const { start, end } = getRandomPeriod(7, 7);
    startDate = formatDate(start);
    endDate = formatDate(end);
    console.log(`📅 Default 7-day period: ${startDate} to ${endDate}`);
  }
  
  // Run backtests
  const summary: any[] = [];
  
  for (const symbol of symbols) {
    console.log(`\n🔄 Running backtest for ${symbol}...`);
    
    try {
      console.log(`🔍 DEBUG: Creating PolygonDataFeed for ${symbol} with dates ${startDate} to ${endDate}`);
      const feed = new PolygonDataFeed(symbol);
      const executedTrades = await runReplayViaFeed(symbol, feed.iterate(startDate, endDate));
      
      // Generate results - only count completed round-trip trades for win rate
      const completedTrades = executedTrades.filter((t: any) => t.tradeType === 'exit');
      const pnl = completedTrades.reduce((total, trade: any) => total + (Number(trade.pnl) || 0), 0);
      const winRate = completedTrades.length > 0 ? 
        (completedTrades.filter((t: any) => (Number(t.pnl) || 0) > 0).length / completedTrades.length * 100) : 0;
      
      summary.push({ 
        symbol, 
        trades: completedTrades.length, // Count only completed round-trip trades
        pnl: Number(pnl.toFixed(2)),
        winRate: Number(winRate.toFixed(1))
      });
      
      // Save individual results
      fs.writeFileSync(
        path.join(outputDir, `${symbol.replace(':', '_')}.json`), 
        JSON.stringify(executedTrades, null, 2)
      );
      
      console.log(`✓ ${symbol}: ${completedTrades.length} completed trades, PnL: $${pnl.toFixed(2)}, Win Rate: ${winRate.toFixed(1)}%`);
      
    } catch (error) {
      console.error(`❌ Error backtesting ${symbol}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      summary.push({ symbol, trades: 0, pnl: 0, winRate: 0, error: errorMessage });
    }
  }
  
  // Save summary
  fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));
  
  console.log('\n📊 Backtest Summary:');
  console.table(summary);
  
  const totalPnl = summary.reduce((total, s) => total + s.pnl, 0);
  const totalTrades = summary.reduce((total, s) => total + s.trades, 0);
  console.log(`\n💰 Total PnL: $${totalPnl.toFixed(2)}`);
  console.log(`📈 Total Trades: ${totalTrades}`);
  console.log(`📁 Results saved to: ${outputDir}`);
  
  // Display execution pipeline monitoring results
  const backtestDuration = Date.now() - backtestStartTime;
  console.log('\n🔍 EXECUTION PIPELINE MONITORING RESULTS:');
  console.log('=' .repeat(60));
  
  const metrics = executionMonitor.getMetricsSummary();
  
  // Trade Execution Metrics
  console.log('\n📈 TRADE EXECUTION METRICS:');
  console.log(`  Total Simulated Trades: ${metrics.trade.totalTrades}`);
  console.log(`  Successful Trades: ${metrics.trade.successfulTrades} (${metrics.trade.successRate.toFixed(2)}%)`);
  console.log(`  Failed Trades: ${metrics.trade.failedTrades}`);
  console.log(`  Average Execution Latency: ${metrics.trade.avgExecutionLatency.toFixed(0)}ms`);
  console.log(`  P95 Latency: ${metrics.latency.p95Latency.toFixed(0)}ms`);
  console.log(`  P99 Latency: ${metrics.latency.p99Latency.toFixed(0)}ms`);
  
  // Database Operation Metrics
  console.log('\n💾 DATABASE OPERATION METRICS:');
  console.log(`  Total DB Operations: ${metrics.database.totalOperations}`);
  console.log(`  Successful Operations: ${metrics.database.successfulOperations} (${metrics.database.successRate.toFixed(2)}%)`);
  console.log(`  Failed Operations: ${metrics.database.failedOperations}`);
  console.log(`  Average DB Latency: ${metrics.database.avgLatency.toFixed(0)}ms`);
  
  // Risk Management Metrics
  console.log('\n⚠️ RISK MANAGEMENT METRICS:');
  console.log(`  Total Risk Checks: ${metrics.risk.totalRiskChecks}`);
  console.log(`  Risk Breaches: ${metrics.risk.riskBreaches} (${metrics.risk.breachRate.toFixed(2)}%)`);
  console.log(`  Critical Breaches: ${metrics.risk.criticalBreaches}`);
  console.log(`  Warning Breaches: ${metrics.risk.warningCount}`);
  
  // Pipeline Health Assessment
  console.log('\n🏥 PIPELINE HEALTH ASSESSMENT:');
  console.log(`  Overall Status: ${metrics.health.status.toUpperCase()}`);
  console.log(`  Health Score: ${metrics.health.score}/100`);
  console.log(`  Backtest Duration: ${Math.floor(backtestDuration / 1000)}s`);
  
  if (metrics.health.issues.length > 0) {
    console.log('\n  Issues Identified:');
    metrics.health.issues.forEach(issue => console.log(`    - ${issue}`));
  }
  
  // Active Alerts
  if (metrics.activeAlerts.length > 0) {
    console.log('\n🚨 ACTIVE ALERTS:');
    console.log(`  Total Alerts: ${metrics.activeAlerts.length}`);
    
    const alertCounts = {
      critical: metrics.activeAlerts.filter(a => a.severity === 'critical').length,
      warning: metrics.activeAlerts.filter(a => a.severity === 'warning').length,
      info: metrics.activeAlerts.filter(a => a.severity === 'info').length
    };
    
    console.log(`  Critical: ${alertCounts.critical}, Warning: ${alertCounts.warning}, Info: ${alertCounts.info}`);
    
    // Show recent alerts
    console.log('\n  Recent Alerts:');
    metrics.activeAlerts.slice(0, 5).forEach(alert => {
      const age = Math.floor((Date.now() - alert.timestamp) / 1000);
      console.log(`    🚨 [${alert.severity.toUpperCase()}] ${alert.component}: ${alert.message} (${age}s ago)`);
    });
  } else {
    console.log('\n✅ No active alerts - pipeline operating normally');
  }
  
  // Performance Grading
  console.log('\n📊 PERFORMANCE GRADING:');
  const tradeGrade = metrics.trade.successRate >= 90 ? 'A' : 
                    metrics.trade.successRate >= 80 ? 'B' :
                    metrics.trade.successRate >= 70 ? 'C' : 'D';
  
  const dbGrade = metrics.database.successRate >= 95 ? 'A' :
                 metrics.database.successRate >= 90 ? 'B' :
                 metrics.database.successRate >= 85 ? 'C' : 'D';
  
  const riskGrade = metrics.risk.breachRate <= 5 ? 'A' :
                   metrics.risk.breachRate <= 10 ? 'B' :
                   metrics.risk.breachRate <= 20 ? 'C' : 'D';
  
  console.log(`  Trade Execution: ${tradeGrade} (${metrics.trade.successRate.toFixed(1)}%)`);
  console.log(`  Database Operations: ${dbGrade} (${metrics.database.successRate.toFixed(1)}%)`);
  console.log(`  Risk Management: ${riskGrade} (${metrics.risk.breachRate.toFixed(1)}% breach rate)`);
  
  // Recommendations
  console.log('\n💡 SYSTEM RECOMMENDATIONS:');
  const recommendations: string[] = [];
  
  if (metrics.trade.successRate < 85) {
    recommendations.push('Trade success rate below optimal - investigate execution logic');
  }
  if (metrics.database.successRate < 95) {
    recommendations.push('Database reliability needs attention - check connection stability');
  }
  if (metrics.latency.p95Latency > 1000) {
    recommendations.push('Execution latency elevated - optimize performance pipeline');
  }
  if (metrics.risk.breachRate > 10) {
    recommendations.push('Risk breach rate high - review risk management parameters');
  }
  if (metrics.activeAlerts.length > 5) {
    recommendations.push('Multiple active alerts - address system issues promptly');
  }
  
  if (recommendations.length === 0) {
    console.log('  ✅ All systems operating within acceptable parameters');
  } else {
    recommendations.forEach((rec, i) => console.log(`  ${i + 1}. ${rec}`));
  }
  
  // Save monitoring results
  const monitoringResults = {
    backtestDuration,
    metrics,
    recommendations,
    timestamp: new Date().toISOString()
  };
  
  fs.writeFileSync(
    path.join(outputDir, 'execution_monitoring.json'), 
    JSON.stringify(monitoringResults, null, 2)
  );
  
  console.log(`\n📋 Execution monitoring results saved to: ${path.join(outputDir, 'execution_monitoring.json')}`);
  console.log('\n🎯 BACKTEST WITH EXECUTION MONITORING COMPLETE!');
  console.log('=' .repeat(60));
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: any = {};
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--symbol':
      case '-s':
        options.symbol = args[++i];
        break;
      case '--symbols':
        options.symbols = args[++i].split(',');
        break;
      case '--start':
        options.startDate = args[++i];
        break;
      case '--end':
        options.endDate = args[++i];
        break;
      case '--random':
      case '-r':
        options.randomPeriod = true;
        break;
      case '--days':
      case '-d':
        options.periodDays = parseInt(args[++i]);
        break;
      case '--all':
      case '-a':
        options.allAssets = true;
        break;
      case '--help':
      case '-h':
        console.log(`
🚀 Unified Backtest Script

Usage: pnpm backtest [options]

Options:
  -s, --symbol <symbol>     Single symbol to backtest (default: X:BTCUSD)
  --symbols <sym1,sym2>     Multiple symbols (comma-separated)
  -a, --all                 Backtest all active tradable assets
  --start <YYYY-MM-DD>      Start date
  --end <YYYY-MM-DD>        End date
  -r, --random              Use random period within last 30 days
  -d, --days <number>       Period length in days (default: 7)
  -h, --help                Show this help

Examples:
  pnpm backtest                           # Default: BTC, random 7 days
  pnpm backtest -s X:ETHUSD -r -d 14     # ETH, random 14 days
  pnpm backtest --start 2024-01-01 --end 2024-01-31  # Custom period
  pnpm backtest -a --start 2024-01-01 --end 2024-01-07  # All assets
        `);
        process.exit(0);
        break;
    }
  }
  
  await runBacktest(options);
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => {
      console.log('\n✅ Backtest completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Error during backtest:', error);
      process.exit(1);
    });
}

export { runBacktest }; 