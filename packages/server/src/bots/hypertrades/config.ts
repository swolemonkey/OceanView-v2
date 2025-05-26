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
  updatedAt: Date;
};

export async function loadConfig(){
  const row = await prisma.hyperSettings.findUnique({ where:{ id:1 }});
  // Cast row to the extended type
  const extendedRow = row as unknown as ExtendedHyperSettings;
  
  const symbols = (extendedRow?.symbols ?? process.env.HYPER_SYMBOLS ?? 'bitcoin')
                  .split(',').map((s: string)=>s.trim().toLowerCase());
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
    symbol: 'bitcoin'
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
  execution: {
    slippageLimit: 0.003,   // 0.3% max slippage tolerance
    valueSplit: 2000,       // USD threshold for splitting orders
    timeoutMs: 3000         // 3 second timeout for API calls
  }
};

export const execCfg = { slippage:0.003, splitUSD:2000 };
export const forkCfg = { mutatePct:0.10 };
export const cronCfg = { fork:'0 0 * * 6', eval:'0 0 * * 0', learn:'0 0 * * *' }; 