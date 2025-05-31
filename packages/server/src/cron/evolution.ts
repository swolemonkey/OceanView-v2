/**
 * Evolution Cron Job
 * 
 * Schedules nightly evolution runs to optimize strategy parameters
 */

import cron from 'node-cron';
import { runEvolution } from '../evolution/runner.js';
import { createLogger } from '../utils/logger.js';

// Initialize logger
const logger = createLogger('evolution-cron');

// Schedule evolution run at 3:00 AM UTC every day
// The pattern is: minute hour day-of-month month day-of-week
cron.schedule('0 3 * * *', async () => {
  logger.info('Starting scheduled evolution run');
  try {
    await runEvolution();
    logger.info('Completed scheduled evolution run');
  } catch (error) {
    logger.error('Error during evolution run:', { error });
  }
});

// Export for use in other modules
export const evolutionCron = { runEvolution }; 