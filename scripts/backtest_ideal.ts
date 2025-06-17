import { runReplayViaFeed } from './replay_historical.js';
import { PolygonDataFeed } from '../packages/server/src/feeds/polygonDataFeed.js';
import fs from 'fs';
import path from 'path';

// Calculate random 7-day period within last 30 days
function getRandomPeriod() {
  const endDate = new Date();
  const maxDaysAgo = 30; // Maximum days to look back
  const periodDays = 7;  // Length of backtest period
  
  // Random number of days to look back (between 7 and 30)
  const randomDaysAgo = Math.floor(Math.random() * (maxDaysAgo - periodDays)) + periodDays;
  
  const periodEnd = new Date(endDate.getTime() - (randomDaysAgo * 24 * 60 * 60 * 1000));
  const periodStart = new Date(periodEnd.getTime() - (periodDays * 24 * 60 * 60 * 1000));
  
  return { start: periodStart, end: periodEnd };
}

// Format dates for Polygon API
const formatDate = (date: Date) => date.toISOString().split('T')[0];

// Ensure output directory exists and clean old files
function setupOutputDirectory() {
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
}

async function runIdealBacktest(symbol: string) {
  const { start, end } = getRandomPeriod();
  
  console.log(`Starting 7-day backtest for ${symbol}`);
  console.log(`Period: ${formatDate(start)} to ${formatDate(end)}`);
  
  // Setup output directory and clean old files
  setupOutputDirectory();
  
  const feed = new PolygonDataFeed(symbol);
  await runReplayViaFeed(symbol, feed.iterate(formatDate(start), formatDate(end)));
  
  console.log(`Completed 7-day backtest for ${symbol}`);
}

// Run backtest for BTC
runIdealBacktest('X:BTCUSD')
  .then(() => {
    console.log('Backtest completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error during backtest:', error);
    process.exit(1);
  }); 