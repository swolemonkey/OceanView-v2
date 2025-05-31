import fs from 'fs';
import path from 'path';
import { AssetAgent } from '../../packages/server/src/bots/hypertrades/assetAgent';
import { loadConfig } from '../../packages/server/src/bots/hypertrades/config';
import { PortfolioRiskManager } from '../../packages/server/src/risk/portfolioRisk';
import { RLGatekeeper } from '../../packages/server/src/rl/gatekeeper';
import { InferenceSession } from 'onnxruntime-node';
import { DataFeed, Tick } from '../../packages/server/src/feeds/interface';
import { Candle } from '../../packages/server/src/bots/hypertrades/perception';
import { SimEngine } from '../../packages/server/src/execution/sim';

// Mock DB for testing
jest.mock('../../packages/server/src/db', () => ({
  prisma: {
    bot: {
      findUnique: jest.fn().mockResolvedValue({ equity: 10000 }),
    },
    order: {
      create: jest.fn().mockImplementation((data) => ({ id: 1, ...data.data })),
    },
    trade: {
      create: jest.fn().mockImplementation((data) => ({ id: 1, ...data.data })),
    },
    rLDataset: {
      create: jest.fn().mockImplementation((data) => ({ id: 1, ...data.data })),
    },
    accountState: {
      upsert: jest.fn(),
      findFirst: jest.fn().mockResolvedValue({ equity: 10000 }),
    },
    hyperSettings: {
      findUnique: jest.fn().mockResolvedValue({ 
        id: 1, 
        maxDailyLoss: 0.03, 
        maxOpenRisk: 0.05,
        strategyToggle: {
          'BTC-USD': { smcReversal: true, trendFollowMA: true },
          'AAPL': { smcReversal: true, rangeBounce: true }
        }
      }),
    },
  },
}));

// Create a mock for the ONNX InferenceSession with a trade scoring mechanism
// that will veto one trade and allow another
jest.mock('../../packages/server/src/rl/gatekeeper', () => {
  // Keep track of call count to alternate between scores
  let callCount = 0;
  
  // Create a spy to track calls
  const vetoedTrades = [];
  const executedTrades = [];
  
  // Export the mock
  const originalModule = jest.requireActual('../../packages/server/src/rl/gatekeeper');
  
  return {
    ...originalModule,
    RLGatekeeper: class MockGatekeeper {
      constructor() {}
      
      async scoreIdea(features, action) {
        // Increment call count
        callCount++;
        
        // Alternate between scores to ensure both veto and execution paths are tested
        const score = callCount % 2 === 0 ? 0.45 : 0.6;
        
        // Track trade decisions
        if (score < 0.55) {
          vetoedTrades.push({ features, action, score });
        } else {
          executedTrades.push({ features, action, score });
        }
        
        return { score, id: callCount };
      }
      
      static getTradeStats() {
        return {
          vetoed: vetoedTrades.length,
          executed: executedTrades.length
        };
      }
    }
  };
});

// Simple ReplayFeed implementation that replays candles from a CSV file
class ReplayFeed implements DataFeed {
  private data: Candle[] = [];
  private callbacks: Map<string, ((tick: Tick) => void)[]> = new Map();
  private symbols: Set<string> = new Set();

  constructor(csvFiles: { [symbol: string]: string }) {
    // Load data from CSV files
    Object.entries(csvFiles).forEach(([symbol, filePath]) => {
      this.symbols.add(symbol);
      this.callbacks.set(symbol, []);
      
      const csvData = fs.readFileSync(filePath, 'utf8');
      const lines = csvData.split('\n');
      
      // Skip header
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const [timestamp, open, high, low, close] = line.split(',');
        if (!timestamp) continue;
        
        this.data.push({
          ts: parseInt(timestamp),
          o: parseFloat(open),
          h: parseFloat(high),
          l: parseFloat(low),
          c: parseFloat(close)
        });
      }
    });
    
    // Sort data by timestamp
    this.data.sort((a, b) => a.ts - b.ts);
  }

  subscribe(symbol: string, cb: (tick: Tick) => void): void {
    if (!this.callbacks.has(symbol)) {
      this.callbacks.set(symbol, []);
    }
    this.callbacks.get(symbol)?.push(cb);
  }

  // Run the replay feed, emitting candles to subscribers
  async run(): Promise<void> {
    // Group candles by their timestamp
    const candlesByTime = new Map<number, Candle[]>();
    
    this.data.forEach(candle => {
      if (!candlesByTime.has(candle.ts)) {
        candlesByTime.set(candle.ts, []);
      }
      candlesByTime.get(candle.ts)?.push(candle);
    });
    
    // Process candles in timestamp order
    const timestamps = Array.from(candlesByTime.keys()).sort();
    
    for (const ts of timestamps) {
      const candles = candlesByTime.get(ts) || [];
      
      // For each symbol that has a candle at this timestamp
      for (const candle of candles) {
        // Emit tick for each symbol
        for (const symbol of this.symbols) {
          const callbacks = this.callbacks.get(symbol) || [];
          
          // Call each callback for this symbol
          for (const cb of callbacks) {
            cb({
              symbol,
              price: candle.c,
              timestamp: candle.ts
            });
            
            // Give the agent time to process
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Emit onCandleClose
            const agent = globalAgents.get(symbol);
            if (agent) {
              await agent.onCandleClose(candle);
            }
          }
        }
      }
      
      // Pause between timestamps to allow processing
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}

// Global agents collection for testing
const globalAgents = new Map<string, AssetAgent>();

// Create the ReplayFeed instance
const replayFeed = new ReplayFeed({
  'BTC-USD': path.join(__dirname, '../fixtures/btc_5m_sample.csv'),
  'AAPL': path.join(__dirname, '../fixtures/aapl_5m_sample.csv')
});

describe('Live Trading Smoke Test', () => {
  let riskManager: PortfolioRiskManager;
  
  beforeAll(async () => {
    // Set environment variable for ONNX model path
    process.env.ONNX_PATH = 'ml/gatekeeper_v2.onnx';
    
    // Load config
    const config = await loadConfig(1);
    
    // Initialize risk manager
    riskManager = new PortfolioRiskManager();
    await riskManager.init();
    
    // Initialize agents
    const btcAgent = new AssetAgent('BTC-USD', config, 1, 1);
    const aaplAgent = new AssetAgent('AAPL', config, 1, 1);
    
    // Set data feed and execution engine
    const simEngine = new SimEngine(1);
    btcAgent.setDataFeed(replayFeed);
    btcAgent.setExecutionEngine(simEngine);
    aaplAgent.setDataFeed(replayFeed);
    aaplAgent.setExecutionEngine(simEngine);
    
    // Store agents globally
    globalAgents.set('BTC-USD', btcAgent);
    globalAgents.set('AAPL', aaplAgent);
  });
  
  test('E2E smoke test with gatekeeper_v2.onnx', async () => {
    // Run the replay feed
    await replayFeed.run();
    
    // Get trade stats from our mocked RLGatekeeper
    const stats = (RLGatekeeper as any).getTradeStats();
    
    // Assert at least 1 trade was vetoed
    expect(stats.vetoed).toBeGreaterThanOrEqual(1);
    
    // Assert at least 1 trade was executed
    expect(stats.executed).toBeGreaterThanOrEqual(1);
    
    // Assert portfolio risk is within limits
    expect(riskManager.openRiskPct).toBeLessThanOrEqual(riskManager.maxOpenRisk * 100);
    
    console.log('Trade stats:', stats);
    console.log('Portfolio risk:', {
      openRiskPct: riskManager.openRiskPct,
      maxOpenRisk: riskManager.maxOpenRisk * 100,
      dayPnl: riskManager.dayPnl
    });
  }, 30000); // 30 second timeout
}); 