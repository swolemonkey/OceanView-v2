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
  strategyToggle: Record<string, Record<string, boolean>>;
  execution?: {
    slippageLimit: number;
    valueSplit: number;
    timeoutMs: number;
  };
};

// Define an extended type to include the new schema fields
type ExtendedHyperSettings = {
  id: number;
  smcThresh: number;
  rsiOS: number;
  rsiOB?: number;
  symbols: string;
  riskPct?: number;
  smcMinRetrace?: number;
  strategyToggle?: string;
  updatedAt: Date;
  maxDailyLoss: number;
  maxOpenRisk: number;
};

export async function loadConfig(){
  // Get the config from the database
  const row = await prisma.hyperSettings.findUnique({ where:{ id:1 }});
  if (!row) {
    throw new Error('HyperSettings not found in database. Please ensure ID 1 exists.');
  }
  
  // Cast row to the extended type
  const extendedRow = row as unknown as ExtendedHyperSettings;
  
  // Get symbols from database, split and normalize
  const symbols = extendedRow.symbols
                  .split(',')
                  .map((s: string) => s.trim().toLowerCase())
                  .filter((s: string) => s.length > 0);
  
  if (symbols.length === 0) {
    throw new Error('No trading symbols configured in HyperSettings.symbols');
  }
  
  // Parse strategyToggle JSON, default to empty object
  let strategyToggle: Record<string, Record<string, boolean>> = {};
  try {
    strategyToggle = extendedRow?.strategyToggle ? JSON.parse(extendedRow.strategyToggle) : {};
  } catch (e) {
    console.error('Error parsing strategyToggle JSON:', e);
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
    strategyToggle
  } as const;
}

export const defaultConfig = {
  symbols: ['bitcoin'],    // support multiple symbols
  symbol: 'bitcoin',        // start narrow
  riskPct: 1,               // % equity per trade
  smc:  { 
    thresh: 0.002,          // 0.2 % stop-hunt detection
    minRetrace: 0.5         // 50% minimum price retracement
  },
  ta:   { 
    rsiPeriod: 14, 
    overSold: 35, 
    overBought: 65 
  },
  strategyToggle: {},      // Default empty strategy toggle configuration
  execution: {
    slippageLimit: 0.003,   // 0.3% max slippage tolerance
    valueSplit: 2000,       // USD threshold for splitting orders
    timeoutMs: 3000         // 3 second timeout for API calls
  }
};

export const execCfg = { slippage:0.003, splitUSD:2000 };
export const forkCfg = { mutatePct:0.10 };
export const cronCfg = { fork:'0 0 * * 6', eval:'0 0 * * 0', learn:'0 0 * * *' }; 