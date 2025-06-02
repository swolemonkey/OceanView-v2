import { prisma } from '../db.js';

interface HeartbeatData {
  status: string;
  details: string;
}

/**
 * Records a heartbeat in the database and simulates a statsd increment
 */
export async function recordHeartbeat() {
  try {
    const heartbeatData: HeartbeatData = {
      status: 'ok',
      details: 'Normal operation'
    };
    
    // Try to use the botHeartbeat model directly with the correct capitalization
    try {
      await prisma.botHeartbeat.create({
        data: heartbeatData
      });
      
      // Simulate statsd increment - in a real environment, this would use a statsd client
      console.log('[statsd] increment: bot.heartbeat');
    } catch (error) {
      console.log('[heartbeat] Skipping heartbeat record - botHeartbeat model not available');
      // Print the available Prisma models for debugging
      console.log('[heartbeat] Available Prisma models:', Object.keys(prisma));
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to record heartbeat:', errorMessage);
  }
}

/**
 * Initializes the heartbeat service
 * Records a heartbeat at startup and every 5 minutes
 */
export function initHeartbeat() {
  // Record initial heartbeat
  recordHeartbeat();
  
  // Set up interval for heartbeat every 5 minutes
  const FIVE_MINUTES = 5 * 60 * 1000;
  setInterval(recordHeartbeat, FIVE_MINUTES);
  
  console.log('[heartbeat] Service initialized, recording every 5 minutes');
} 