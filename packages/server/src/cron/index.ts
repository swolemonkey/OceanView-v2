import cron from 'node-cron';
import { computeYesterdayMetrics } from './metrics.js';
import { computePortfolioMetrics } from './portfolio.js';
import { retrainGatekeeper } from '../rl/retrainJob.js';

// Schedule metrics computation at midnight UTC
cron.schedule('0 0 * * *', () => computeYesterdayMetrics());

// Schedule portfolio metrics computation at 5 minutes past midnight UTC
// This ensures it runs after the regular metrics computation
cron.schedule('5 0 * * *', () => computePortfolioMetrics());

// Retrain gatekeeper model every Monday at 02:00 UTC
cron.schedule('0 2 * * 1', () => retrainGatekeeper()); 