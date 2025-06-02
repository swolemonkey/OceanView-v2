/**
 * Parameter Manager for Evolution System
 * 
 * Handles mutation and evaluation of strategy parameters
 */

/**
 * Mutate a given parameter set by randomly adjusting numeric values by ±10%
 * @param params The parameters to mutate
 * @returns A new parameter object with mutated values
 */
export function mutate(params: any) {
  const out = JSON.parse(JSON.stringify(params));
  for (const k in out) {
    if (typeof out[k] === 'number') {
      const delta = out[k] * 0.1 * (Math.random() * 2 - 1);
      out[k] = +(out[k] + delta).toFixed(6);
    }
  }
  return out;
}

/**
 * Calculate performance metrics from a set of trades
 * @param trades Array of trade objects with pnl field
 * @returns Object containing sharpe ratio and drawdown metrics
 */
export function score(trades: { pnl: number }[]) {
  // Handle empty array case
  if (!trades.length) {
    return { sharpe: 0, drawdown: 0 };
  }
  
  const pnl = trades.map(t => t.pnl);
  const mean = pnl.reduce((a, b) => a + b, 0) / pnl.length;
  
  // Calculate standard deviation with protection against division by zero
  let stdev = Math.sqrt(pnl.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / pnl.length);
  
  // If all returns are the same, stdev will be 0, which would give Infinity sharpe
  // Set a minimum value to avoid division by zero
  if (stdev < 0.0001) stdev = 0.0001;
  
  const sharpe = mean / stdev;
  
  // Calculate equity curve and drawdown
  let equity = 0;
  let maxEquity = 0;
  let maxDrawdown = 0;
  
  for (const p of pnl) {
    equity += p;
    maxEquity = Math.max(maxEquity, equity);
    const drawdown = maxEquity - equity;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }
  
  return { sharpe, drawdown: maxDrawdown };
}

export default { mutate, score }; 