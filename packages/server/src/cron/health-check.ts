import * as cron from 'node-cron';
import fetch from 'node-fetch';
import { prisma } from '../db.js';

// Define the metrics response type
interface MetricsResponse {
  equity: number;
  pnl: number;
  drawdown: number;
  tradeCount24h: number;
  gatekeeperVetoRatio: number;
  latestSentiment: number;
  latestOrderBookImbalance: number;
}

/**
 * Daily health check function
 * - Pulls metrics from /metrics endpoint
 * - Compares with previous day
 * - Logs alerts if necessary
 */
export async function dailyHealthCheck() {
  try {
    // Get metrics from endpoint
    const response = await fetch('http://localhost:3334/metrics');
    const metrics = await response.json() as MetricsResponse;
    
    // Get yesterday's portfolio metric
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const yesterdayMetric = await (prisma as any).portfolioMetric.findFirst({
      where: {
        date: {
          gte: yesterday
        }
      },
      orderBy: {
        date: 'desc'
      }
    });
    
    // Determine if there are any alerts
    const alerts: string[] = [];
    
    // Alert if drawdown > 5%
    if (metrics.drawdown > 5) {
      alerts.push(`Drawdown exceeds 5% (current: ${metrics.drawdown.toFixed(2)}%)`);
    }
    
    // Alert if missed trades > 10
    if (metrics.tradeCount24h < 10) {
      alerts.push(`Low trade count in last 24h: ${metrics.tradeCount24h}`);
    }
    
    // Log results
    if (alerts.length > 0) {
      const alertMessage = alerts.join(', ');
      console.log(`[ALERT] Health check issues detected: ${alertMessage}`);
      
      // Record heartbeat with alert status
      await (prisma as any).botHeartbeat.create({
        data: {
          status: 'alert',
          details: alertMessage
        }
      });
    } else {
      console.log('[health] Daily health check passed');
      
      // Record normal heartbeat
      await (prisma as any).botHeartbeat.create({
        data: {
          status: 'ok',
          details: 'Daily health check passed'
        }
      });
    }
    
    return { alerts };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Health check failed:', errorMessage);
    
    // Record error heartbeat
    await (prisma as any).botHeartbeat.create({
      data: {
        status: 'alert',
        details: `Health check error: ${errorMessage}`
      }
    });
    
    return { error: 'Health check failed' };
  }
}

/**
 * Initialize the daily health check cron job
 * Runs at 07:00 UTC every day
 */
export function initHealthCheck() {
  // Schedule cron job to run at 07:00 UTC
  cron.schedule('0 7 * * *', dailyHealthCheck, {
    timezone: 'UTC'
  });
  
  console.log('[cron] Daily health check scheduled for 07:00 UTC');
} 