/**
 * Evolution Cron Job
 * 
 * Schedules nightly evolution runs to optimize strategy parameters
 */

import cron from 'node-cron';
import { runEvolution } from '../packages/server/src/evolution/runner.js';

// Schedule evolution run at 3:00 AM UTC every day
// The pattern is: minute hour day-of-month month day-of-week
cron.schedule('0 3 * * *', async () => {
  console.log('[evolution] Starting scheduled evolution run');
  await runEvolution();
  console.log('[evolution] Completed scheduled evolution run');
});

// Export for use in other modules
export const evolutionCron = { runEvolution }; 