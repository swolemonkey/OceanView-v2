import { PolygonDataFeed } from '../feeds/polygonDataFeed.js';
import { prisma } from '../db.js';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Local implementation of runReplayViaFeed
async function runReplayViaFeed(symbol: string, dataIterator: AsyncIterable<any>): Promise<void> {
  // This is a simplified implementation that processes the data iterator
  // In a real implementation, this would feed data to the bot system
  console.log(`Processing data for ${symbol}...`);
  
  let count = 0;
  for await (const data of dataIterator) {
    count++;
    // Process each data point (this would normally feed to the bot)
    if (count % 1000 === 0) {
      console.log(`Processed ${count} data points for ${symbol}`);
    }
  }
  
  console.log(`Completed processing ${count} data points for ${symbol}`);
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
  const randomDaysAgo = Math.floor(Math.random() * (daysBack - periodDays)) + periodDays;
  
  const periodEnd = new Date(endDate.getTime() - (randomDaysAgo * 24 * 60 * 60 * 1000));
  const periodStart = new Date(periodEnd.getTime() - (periodDays * 24 * 60 * 60 * 1000));
  
  return { start: periodStart, end: periodEnd };
}

const formatDate = (date: Date): string => date.toISOString().split('T')[0];

// Output management
function setupOutputDirectory(): string {
  const outputDir = path.join(process.cwd(), '../../../../data', 'backtest_results');
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
  
  const outputDir = setupOutputDirectory();
  let symbols: string[] = [];
  let startDate: string;
  let endDate: string;
  
  // Determine symbols to backtest
  if (options.allAssets) {
    console.log('📊 Loading all active tradable assets...');
    const assets = await prisma.tradableAsset.findMany({ where: { active: true } });
    symbols = assets.map(a => a.symbol);
    console.log(`Found ${symbols.length} active assets: ${symbols.join(', ')}`);
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
      const feed = new PolygonDataFeed(symbol);
      await runReplayViaFeed(symbol, feed.iterate(startDate, endDate));
      
      // Generate results
      const trades = await prisma.trade.findMany({ 
        where: { symbol },
        orderBy: { ts: 'desc' },
        take: 1000 // Limit to recent trades
      });
      
      const pnl = trades.reduce((total, trade: any) => total + (Number(trade.pnl) || 0), 0);
      const winRate = trades.length > 0 ? 
        (trades.filter((t: any) => (Number(t.pnl) || 0) > 0).length / trades.length * 100) : 0;
      
      summary.push({ 
        symbol, 
        trades: trades.length, 
        pnl: Number(pnl.toFixed(2)),
        winRate: Number(winRate.toFixed(1))
      });
      
      // Save individual results
      fs.writeFileSync(
        path.join(outputDir, `${symbol.replace(':', '_')}.json`), 
        JSON.stringify(trades, null, 2)
      );
      
      console.log(`✓ ${symbol}: ${trades.length} trades, PnL: $${pnl.toFixed(2)}, Win Rate: ${winRate.toFixed(1)}%`);
      
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