import cron from 'node-cron';
import { computeYesterdayMetrics } from './metrics.js';

// Schedule metrics computation at midnight UTC
cron.schedule('0 0 * * *', () => computeYesterdayMetrics()); 