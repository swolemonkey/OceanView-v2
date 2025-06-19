import { prisma } from '../../db.js';

export type Config = {
  symbols: string[];
  smc: { 
    thresh: number;
    minRetrace: number;
  };
  ta: { 
    rsiPeriod: number; 
    overSold: number; 
    overBought: number 
  };
  riskPct: number;
  symbol: string;
  strategyToggle: Record<string, boolean>;
  gatekeeperThresh: number;
  // Asset-class specific risk multipliers
  assetClassRisk?: {
    crypto?: number;
    equity?: number;
    future?: number;
  };
  // Minimum hold times by asset class (in milliseconds)
  minHoldTimes?: {
    crypto?: number;
    equity?: number;
    future?: number;
  };
  // Profit thresholds before trailing stop activation
  trailingStopThresholds?: {
    crypto?: number;
    equity?: number; 
    future?: number;
  };
  execution?: {
    slippageLimit: number;
    valueSplit: number;
    timeoutMs: number;
  };
  // 5-minute optimization properties
  maxHoldMinutes?: number;
  trailingStopATR?: number;
  maxDailyLoss?: number;
  maxConcurrentTrades?: number;
  fastMA?: number;
  slowMA?: number;
  atrPeriod?: number;
  adxPeriod?: number;
  minConfidence?: number;
  maxTradesPerHour?: number;
  cooldownMinutes?: number;
};

// Define an extended type to include the new schema fields
type ExtendedHyperSettings = {
  id: number;
  smcThresh: number;
  rsiOS: number;
  rsiOB?: number;
  symbols: string;
  indicatorSet?: string;
  riskPct?: number;
  smcMinRetrace?: number;
  strategyToggle?: string;
  gatekeeperThresh?: number;
  updatedAt: Date;
  maxDailyLoss: number;
  maxOpenRisk: number;
};

export async function loadConfig(){
  // Get the config from the database
  const row = await prisma.hyperSettings.findUnique({ where:{ id:1 }});
  console.log("Row from database:", row);
  if (!row) {
    throw new Error('HyperSettings not found in database. Please ensure ID 1 exists.');
  }
  
  // Cast row to the extended type
  const extendedRow = row as unknown as ExtendedHyperSettings;
  console.log("ExtendedRow:", extendedRow);
  
  // Use default values if fields are missing
  const symbolsStr = extendedRow.symbols || 'bitcoin';
  console.log("Symbols string:", symbolsStr);
  
  // Get symbols from database, split and normalize
  const symbols = symbolsStr
                  .split(',')
                  .map((s: string) => s.trim().toLowerCase())
                  .filter((s: string) => s.length > 0);
  
  if (symbols.length === 0) {
    throw new Error('No trading symbols configured in HyperSettings.symbols');
  }
  
  // Parse strategyToggle JSON with deterministic default
  const raw = extendedRow?.strategyToggle ?? '{}';
  let strategyToggle: Record<string, boolean> = {};
  
  try {
    strategyToggle = JSON.parse(raw);
    
    // Ensure we have default values for all strategies
    if (!('TrendFollowMA' in strategyToggle)) strategyToggle.TrendFollowMA = true;
    if (!('RangeBounce' in strategyToggle)) strategyToggle.RangeBounce = true;
    if (!('SMCReversal' in strategyToggle)) strategyToggle.SMCReversal = true;
    
    console.log('Loaded strategy toggles:', strategyToggle);
  } catch (e) {
    console.error('Error parsing strategyToggle JSON:', e);
    // Provide deterministic defaults if parsing fails
    strategyToggle = {
      TrendFollowMA: true,
      RangeBounce: true,
      SMCReversal: true
    };
  }
  
  return {
    symbols,
    smc: { 
      thresh: extendedRow?.smcThresh ?? 0.002,
      minRetrace: extendedRow?.smcMinRetrace ?? 0.5
    },
    ta: { 
      rsiPeriod: 14, 
      overSold: extendedRow?.rsiOS ?? 35, 
      overBought: extendedRow?.rsiOB ?? 65 
    },
    riskPct: extendedRow?.riskPct ?? 1,
    symbol: symbols[0],  // Default to first symbol
    strategyToggle,
    gatekeeperThresh: extendedRow?.gatekeeperThresh ?? 0.55
  } as const;
}

// ========================================
// 🎯 FURTHER OPTIMIZED CONFIG FOR 5-MINUTE TIMEFRAMES
// Based on successful backtest: 38 trades, 68.4% win rate, +$2,406 profit
// ========================================
export const defaultConfig = {
  symbols: ['bitcoin'],    // support multiple symbols
  symbol: 'bitcoin',        // start narrow
  riskPct: 0.4,            // Further reduced from 0.5% - more conservative for higher win rate
  // Asset-class specific risk multipliers
  assetClassRisk: {
    crypto: 1.0,           // BTC performed well, keep current sizing
    equity: 0.5,           // Reduce equity sizing (NVDA, TSLA, etc. were struggling)
    future: 0.7            // Moderate sizing for futures
  },
  // Minimum hold times by asset class (in milliseconds)
  minHoldTimes: {
    crypto: 30000,         // 30 seconds for crypto (fast-moving)
    equity: 300000,        // 5 minutes for equity (prevent microsecond churn)
    future: 60000          // 1 minute for futures
  },
  // Profit thresholds before trailing stop activation (percentage)
  trailingStopThresholds: {
    crypto: 0.015,         // 1.5% profit before trailing stops activate for crypto (let BTC run)
    equity: 0.005,         // 0.5% profit for equities (quicker activation due to lower volatility)
    future: 0.010          // 1.0% profit for futures (moderate threshold)
  },
  smc: { 
    thresh: 0.0015,        // Tighter threshold for higher quality setups
    minRetrace: 0.5        // Higher retrace requirement for better R:R
  },
  ta: { 
    rsiPeriod: 14, 
    overSold: 30,          // Less extreme for more trade opportunities (was 20)
    overBought: 70         // Less extreme for more trade opportunities (was 80)
  },
  strategyToggle: {        // All strategies performing well
    TrendFollowMA: true,   // Best performer: 75% win rate
    RangeBounce: true,     // Good: 61.5% win rate  
    SMCReversal: true,     // Good: 69.2% win rate
    MomentumScalp: true    // New high-frequency momentum scalping strategy
  },
  gatekeeperThresh: 0.05,  // Very low threshold - allow most trades through for 5-minute
  
  // === EXECUTION SETTINGS ===
  execution: {
    slippageLimit: 0.002,    // 0.2% slippage limit for 5m
    valueSplit: 2000,        // $2000 split threshold for 5m
    timeoutMs: 3000          // 3s timeout for 5m
  },
  
  // === 5-MINUTE RISK MANAGEMENT ===
  maxHoldMinutes: 60,      // Increased from 25 - allow 5m strategies more time
  trailingStopATR: 1.0,    // Tighter trailing for 5m (was 1.2)
  maxDailyLoss: 2.0,       // 2% max daily loss (was 3%)
  maxConcurrentTrades: 2,  // Keep conservative (was working well)
  
  // === 5-MINUTE INDICATOR TUNING ===
  fastMA: 12,              // Optimized for 5m (was working well)
  slowMA: 26,              // Optimized for 5m (was working well)
  atrPeriod: 14,           // Standard ATR for 5m
  adxPeriod: 14,           // Standard ADX for 5m
  
  // === CONFIDENCE THRESHOLDS ===
  minConfidence: 0.45,     // Reduced from 0.65 - allow more trade opportunities
  maxTradesPerHour: 20,    // Increased from 12 - allow more frequent trading
  cooldownMinutes: 1       // Minimal cooldown for backtest - allow rapid fire trading
};

export const execCfg = { slippage:0.002, splitUSD:2000 }; // Optimized for 5m - higher split for longer timeframe
export const forkCfg = { mutatePct:0.15 }; // Slightly higher mutation for faster adaptation
export const cronCfg = { fork:'0 0 * * 6', eval:'0 0 * * 0', learn:'0 0 * * *' }; 

 