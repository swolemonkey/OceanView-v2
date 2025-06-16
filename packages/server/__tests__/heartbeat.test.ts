import { describe, expect, it, jest, beforeEach } from '@jest/globals';

// Mock Prisma client
jest.mock('../src/db', () => ({
  prisma: {
    botHeartbeat: {
      create: jest.fn().mockResolvedValue({ 
        id: 1, 
        ts: new Date(), 
        status: 'ok', 
        details: 'Normal operation' 
      })
    }
  }
}));

// Mock console.log
const originalConsoleLog = console.log;
console.log = jest.fn();

// Import after mocking
import { recordHeartbeat } from '../src/services/heartbeat';

describe('Heartbeat Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  afterAll(() => {
    // Restore console.log
    console.log = originalConsoleLog;
  });
  
  it('should record a heartbeat', async () => {
    await recordHeartbeat();
    
    // Check if heartbeat was created
    const { prisma } = require('../src/db');
    expect(prisma.botHeartbeat.create).toHaveBeenCalledWith({
      data: {
        status: 'ok',
        details: 'Normal operation'
      }
    });
    
    // Check if statsd increment was logged
    expect(console.log).toHaveBeenCalledWith('[statsd] increment: bot.heartbeat');
  });
}); 