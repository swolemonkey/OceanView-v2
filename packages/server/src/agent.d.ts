/**
 * Main bot loop that continuously fetches market data,
 * evaluates strategies using HyperTrades, and places trades.
 * 
 * This function runs in an infinite loop and should be started
 * as a background task using Promise.resolve().then() or similar.
 */
export function run_bot(): Promise<void>; 