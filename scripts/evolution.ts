/**
 * Evolution CLI Script
 * 
 * Manually trigger the evolution process
 * Usage: pnpm evolution:run
 */

import { runEvolution } from '../packages/server/src/evolution/runner.js';

console.log('[evolution] Starting manual evolution run');

runEvolution()
  .then(() => {
    console.log('[evolution] Manual evolution run completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[evolution] Error during manual evolution run:', error);
    process.exit(1);
  }); 