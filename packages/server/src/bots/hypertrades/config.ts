export const defaultConfig = {
  symbol: 'bitcoin',        // start narrow
  riskPct: 1,               // % equity per trade
  smc:  { thresh: 0.002 },  // 0.2 % stop-hunt detection
  ta:   { rsiPeriod: 14, overSold: 35, overBought: 65 },
  execution: {
    slippageLimit: 0.003,   // 0.3% max slippage tolerance
    valueSplit: 2000,       // USD threshold for splitting orders
    timeoutMs: 3000         // 3 second timeout for API calls
  }
}; 