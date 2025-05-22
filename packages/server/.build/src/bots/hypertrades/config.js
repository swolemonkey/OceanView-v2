export const defaultConfig = {
    symbol: 'bitcoin', // start narrow
    riskPct: 0.75, // % equity per trade
    smc: { thresh: 0.002 }, // 0.2 % stop-hunt detection
    ta: { rsiPeriod: 14, overSold: 35, overBought: 65 }
};
