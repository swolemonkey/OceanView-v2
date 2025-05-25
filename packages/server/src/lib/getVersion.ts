import { execSync } from 'node:child_process';
export function getStrategyVersion(): string {
  if (process.env.STRATEGY_VERSION) return process.env.STRATEGY_VERSION;
  try { return execSync('git rev-parse HEAD').toString().trim(); }
  catch { return 'dev-build'; }
} 