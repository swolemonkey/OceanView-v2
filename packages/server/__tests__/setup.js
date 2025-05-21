import { jest } from '@jest/globals';

// Mock Prisma
jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      price1m: {
        findFirst: jest.fn().mockResolvedValue(null)
      }
    }))
  };
});

// Mock ioredis
jest.mock('ioredis', () => {
  const RedisMock = jest.requireActual('ioredis-mock').default;
  const redis = new RedisMock();
  // Seed some data
  redis.xadd('ticks:crypto', '*', 'symbol', 'bitcoin', 'price', '12345');
  
  return class extends RedisMock {
    constructor() {
      super();
      return redis;
    }
  };
}); 