/**
 * Mutates strategy parameters by a small amount
 * @param params The original parameters
 * @returns The mutated parameters
 */
export function mutate(params: any): any;

/**
 * Scores a set of trades using performance metrics
 * @param trades Array of trades with pnl values
 * @returns Object with performance metrics
 */
export function score(trades: any[]): { sharpe: number; drawdown: number }; 