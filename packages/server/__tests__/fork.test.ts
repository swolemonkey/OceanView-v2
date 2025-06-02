import { weeklyFork, weeklyEvaluate } from '../src/bots/hypertrades/forkManager.js';
import { prisma } from '../src/db.js';
import { jest } from '@jest/globals';

// Type definition to help TypeScript understand our mock
type MockClient = {
  bot: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  hyperSettings: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  metric: {
    findMany: jest.Mock;
  };
};

// Mock the Prisma client
jest.mock('../src/db.js', () => ({
  prisma: {
    bot: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    hyperSettings: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    metric: {
      findMany: jest.fn()
    }
  }
}));

// Cast prisma to our mock type to satisfy TypeScript
const mockPrisma = prisma as unknown as MockClient;

describe('Fork Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('weeklyFork creates child bot with mutated parameters', async () => {
    // Setup mocks
    mockPrisma.bot.findFirst.mockResolvedValue({ id: 1, name: 'hypertrades' });
    mockPrisma.hyperSettings.findUnique.mockResolvedValue({ id: 1, smcThresh: 0.002, rsiOS: 35 });
    mockPrisma.bot.create.mockResolvedValue({ id: 2, name: 'hypertrades_fork_123456789' });
    
    await weeklyFork();
    
    // Verify bot was created
    expect(mockPrisma.bot.create).toHaveBeenCalled();
    expect(mockPrisma.hyperSettings.create).toHaveBeenCalled();
    
    // Verify parameters were passed correctly
    const createCall = mockPrisma.hyperSettings.create.mock.calls[0][0];
    expect(createCall.data.id).toBe(2);
    expect(typeof createCall.data.smcThresh).toBe('number');
    expect(typeof createCall.data.rsiOS).toBe('number');
  });
  
  test('weeklyEvaluate promotes child with better performance', async () => {
    // Setup mocks
    mockPrisma.bot.findMany.mockResolvedValue([{ id: 2, parentId: 1 }]);
    
    // Child metrics with good performance
    const childMetrics = Array(50).fill(0).map((_, i) => ({ 
      botId: 2, 
      pnl: 100 + i, 
      equity: 10000 + i * 100 
    }));
    
    // Parent metrics with worse performance
    const parentMetrics = Array(50).fill(0).map((_, i) => ({ 
      botId: 1, 
      pnl: 50 + i, 
      equity: 10000 + i * 50 
    }));
    
    mockPrisma.metric.findMany
      .mockImplementationOnce(() => Promise.resolve(childMetrics))
      .mockImplementationOnce(() => Promise.resolve(parentMetrics));
    
    mockPrisma.hyperSettings.findUnique.mockResolvedValue({ smcThresh: 0.003, rsiOS: 32 });
    
    await weeklyEvaluate();
    
    // Verify parent was disabled and child was promoted
    expect(mockPrisma.bot.update).toHaveBeenCalledTimes(2);
    expect(mockPrisma.hyperSettings.update).toHaveBeenCalled();
  });
}); 