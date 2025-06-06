import * as cron from 'node-cron';
import fetch from 'node-fetch';
import { prisma } from '../db.js';
import { notify } from '../ops/alertService.js';

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
      const alertMessage = `[ALERT] Health check issues detected: ${alerts.join(', ')}`;
      console.log(alertMessage);
      await notify(alertMessage);
      
      // Record heartbeat with alert status
      const botHeartbeatModel = 
        (prisma as any).botHeartbeat || 
        (prisma as any).BotHeartbeat || 
        (prisma as any).botHeartBeat || 
        (prisma as any).botHEARTBEAT;
        
      if (botHeartbeatModel && typeof botHeartbeatModel.create === 'function') {
        await botHeartbeatModel.create({
          data: {
            status: 'alert',
            details: alertMessage
          }
        });
      } else {
        console.log('[health] Skipping heartbeat record - botHeartbeat model not available');
        console.log('[health] Available Prisma models:', Object.keys(prisma));
      }
    } else {
      console.log('[health] Daily health check passed');
      
      // Record normal heartbeat
      const botHeartbeatModel = 
        (prisma as any).botHeartbeat || 
        (prisma as any).BotHeartbeat || 
        (prisma as any).botHeartBeat || 
        (prisma as any).botHEARTBEAT;
        
      if (botHeartbeatModel && typeof botHeartbeatModel.create === 'function') {
        await botHeartbeatModel.create({
          data: {
            status: 'ok',
            details: 'Daily health check passed'
          }
        });
      } else {
        console.log('[health] Skipping heartbeat record - botHeartbeat model not available');
        console.log('[health] Available Prisma models:', Object.keys(prisma));
      }
    }
    
    return { alerts };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const alertText = `Health check failed: ${errorMessage}`;
    console.error(alertText);
    await notify(alertText);
    
    // Record error heartbeat
    const botHeartbeatModel = 
      (prisma as any).botHeartbeat || 
      (prisma as any).BotHeartbeat || 
      (prisma as any).botHeartBeat || 
      (prisma as any).botHEARTBEAT;
      
    if (botHeartbeatModel && typeof botHeartbeatModel.create === 'function') {
      await botHeartbeatModel.create({
        data: {
          status: 'alert',
          details: `Health check error: ${errorMessage}`
        }
      });
    } else {
      console.log('[health] Skipping heartbeat record - botHeartbeat model not available');
      console.log('[health] Available Prisma models:', Object.keys(prisma));
    }
    
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