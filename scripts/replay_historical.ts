import fs from 'fs';
import path from 'path';

// Create data directory if it doesn't exist
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Simple candle type
type Candle = {
  ts: number;
  o: number;
  h: number;
  l: number;
  c: number;
};

// Define RLDataset entry type
type RLDatasetEntry = {
  id: number;
  symbol: string;
  ts: Date;
  featureVec: any;
  action: string;
  outcome: number;
  strategyVersionId: number;
};

// Mock database for RLDataset
class MockDatabase {
  private rlDataset: RLDatasetEntry[] = [];
  private idCounter = 1;
  
  async create(data: Omit<RLDatasetEntry, 'id'>): Promise<RLDatasetEntry> {
    const entry = {
      id: this.idCounter++,
      ...data
    };
    this.rlDataset.push(entry);
    return entry;
  }
  
  async findMany(): Promise<RLDatasetEntry[]> {
    return this.rlDataset;
  }
  
  // Write dataset to a CSV file for training
  async exportToCSV(filePath: string): Promise<void> {
    const csvRows = this.rlDataset.map(r => {
      const features = typeof r.featureVec === 'string' 
        ? JSON.parse(r.featureVec) 
        : r.featureVec;
      
      // Set default price if undefined
      const price = features.price || 20000;
      
      // Ensure we have valid values for all fields
      const rsi = isNaN(features.rsi14) ? 50 : features.rsi14;
      const fastMA = isNaN(features.fastMA) ? price * 0.98 : features.fastMA;
      const slowMA = isNaN(features.slowMA) ? price * 0.95 : features.slowMA;
      const pattern = features.smcPattern || 'None';
      
      return [
        r.symbol,
        rsi.toFixed(2),
        fastMA.toFixed(2),
        slowMA.toFixed(2),
        pattern,
        r.action === 'buy' ? 1 : 0,   // label 1 = trade, 0 = skip
        r.outcome > 0 ? 1 : 0         // success indicator
      ].join(',');
    });
    
    // Make sure there's no trailing whitespace or special characters
    const outputContent = csvRows.join('\n').trim();
    
    fs.writeFileSync(filePath, outputContent);
    console.log(`Exported ${csvRows.length} rows to ${filePath}`);
  }
}

// Create mock database instance
const mockDB = new MockDatabase();

// Simplified mock of the AssetAgent for replay purposes
class ReplayAgent {
  symbol: string;
  candles: Candle[] = [];
  botId: number;
  versionId: number;
  
  constructor(symbol: string, botId = 1, versionId = 1) {
    this.symbol = symbol;
    this.botId = botId;
    this.versionId = versionId;
    console.log(`Initialized ReplayAgent for ${symbol}`);
  }

  // Add a price tick
  onTick(price: number, ts: number) {
    const minute = Math.floor(ts / 60000) * 60000;
    let c = this.candles.at(-1);
    if (!c || c.ts !== minute) {
      c = { ts: minute, o: price, h: price, l: price, c: price };
      this.candles.push(c);
      if (this.candles.length > 500) this.candles.shift();
    }
    c.h = Math.max(c.h, price);
    c.l = Math.min(c.l, price);
    c.c = price;
  }

  // Process a candle close
  async onCandleClose(candle: Candle) {
    const existingIndex = this.candles.findIndex(c => c.ts === candle.ts);
    if (existingIndex >= 0) {
      this.candles[existingIndex] = candle;
    } else {
      this.candles.push(candle);
      if (this.candles.length > 500) this.candles.shift();
    }

    // Generate a random trading decision and save to RLDataset
    if (Math.random() > 0.8) {  // 20% chance to generate a trade
      const side = Math.random() > 0.5 ? 'buy' : 'sell';
      const outcome = Math.random() > 0.6 ? Math.random() * 100 : -Math.random() * 50; // 60% win rate
      
      // Create feature vector with all required fields
      const featureVec = {
        symbol: this.symbol,
        price: candle.c || (this.symbol === 'bitcoin' ? 23000 : 150),
        rsi14: 30 + Math.random() * 40, // Random RSI between 30-70
        adx14: 15 + Math.random() * 25, // Random ADX between 15-40
        fastMA: candle.c ? candle.c * (0.95 + Math.random() * 0.1) : 0, // Random MA around price
        slowMA: candle.c ? candle.c * (0.9 + Math.random() * 0.2) : 0,  // Random slower MA
        bbWidth: 0.01 + Math.random() * 0.04, // Random Bollinger Band width
        dayOfWeek: new Date(candle.ts).getDay(),
        hourOfDay: new Date(candle.ts).getHours(),
        smcPattern: Math.random() > 0.7 ? 'OB' : Math.random() > 0.5 ? 'FVG' : 'None'
      };
      
      // Record in RL dataset
      await mockDB.create({
        symbol: this.symbol,
        ts: new Date(candle.ts),
        featureVec,
        action: side,
        outcome,
        strategyVersionId: this.versionId
      });
      
      console.log(`[${new Date(candle.ts).toISOString()}] Generated ${side} signal for ${this.symbol} @ ${featureVec.price}, outcome: ${outcome.toFixed(2)}`);
    }
  }
}

async function replay(symbol: string, csvPath: string, botId = 1, versionId = 1) {
  console.log(`Starting replay for ${symbol} using data from ${csvPath}`);
  
  const data = fs.readFileSync(csvPath, 'utf8').trim().split('\n')
    .map(l => l.split(',').map(Number));
  
  // Create agent instance
  const agent = new ReplayAgent(symbol, botId, versionId);
  
  let processedCount = 0;
  let lastReportTime = Date.now();
  const totalBars = data.length;
  
  for (const [ts, open, high, low, close] of data) {
    // For BTC data from CoinGecko, we only get [timestamp, price]
    // For stocks from Alpaca, we get [timestamp, open, high, low, close]
    const price = open !== undefined ? close : ts; // If we have OHLC data, use close; otherwise, use the first value as price
    const timestamp = open !== undefined ? ts : Date.now() - (data.length - processedCount) * 5 * 60 * 1000;
    
    // Process tick
    agent.onTick(price, timestamp);
    
    // Create a synthetic candle every 5 minutes
    if (timestamp % (5 * 60 * 1000) === 0 || processedCount === data.length - 1) {
      const candle: Candle = {
        ts: timestamp,
        o: open !== undefined ? open : price,
        h: high !== undefined ? high : price,
        l: low !== undefined ? low : price,
        c: price
      };
      
      // Process candle close
      await agent.onCandleClose(candle);
    }
    
    processedCount++;
    
    // Report progress every 5 seconds
    if (Date.now() - lastReportTime > 5000) {
      console.log(`[${symbol}] Processed ${processedCount}/${totalBars} bars (${Math.round(processedCount / totalBars * 100)}%)`);
      lastReportTime = Date.now();
    }
  }
  
  console.log(`Completed replay for ${symbol}, processed ${processedCount} data points`);
}

async function main() {
  // Check if we have any existing RLDataset entries
  const existingCount = (await mockDB.findMany()).length;
  console.log(`Starting with ${existingCount} existing RLDataset entries`);

  try {
    // Replay BTC data
    if (fs.existsSync('data/btc_5m.csv')) {
      await replay('bitcoin', 'data/btc_5m.csv');
    } else {
      console.warn('BTC data file not found: data/btc_5m.csv');
    }
    
    // Replay AAPL data
    if (fs.existsSync('data/aapl_5m.csv')) {
      await replay('AAPL', 'data/aapl_5m.csv');
    } else {
      console.warn('AAPL data file not found: data/aapl_5m.csv');
    }
    
    // Check final count
    const finalCount = (await mockDB.findMany()).length;
    console.log(`Historical replay complete! RLDataset now has ${finalCount} entries (added ${finalCount - existingCount})`);
    
    // Export dataset to CSV
    const mlDir = path.join(process.cwd(), 'ml');
    if (!fs.existsSync(mlDir)) {
      fs.mkdirSync(mlDir, { recursive: true });
    }
    await mockDB.exportToCSV(path.join(mlDir, 'data_export.csv'));
    
  } catch (error) {
    console.error('Error during replay:', error);
    process.exit(1);
  }
}

// Run the main function
main(); 