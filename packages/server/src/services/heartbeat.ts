import { prisma } from '../db.js';

/**
 * Records a heartbeat in the database and simulates a statsd increment
 */
export async function recordHeartbeat() {
  try {
    await prisma.botHeartbeat.create({
      data: {
        status: 'ok',
        details: 'Normal operation'
      }
    });
    
    // Simulate statsd increment - in a real environment, this would use a statsd client
    console.log('[statsd] increment: bot.heartbeat');
  } catch (error) {
    console.error('Failed to record heartbeat:', error);
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