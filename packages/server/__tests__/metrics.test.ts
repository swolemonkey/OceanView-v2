import { describe, expect, it, jest, beforeEach } from '@jest/globals';

// Mock Prisma client
jest.mock('../src/db.js', () => ({
  prisma: {
    accountState: {
      findFirst: jest.fn().mockResolvedValue({ equity: 15000 })
    },
    portfolioMetric: {
      findFirst: jest.fn().mockResolvedValue({ 
        equityStart: 15000, 
        equityEnd: 14250,
        dailyPnl: -750
      })
    },
    strategyTrade: {
      count: jest.fn().mockResolvedValue(25)
    },
    rLDataset: {
      count: jest.fn()
        .mockImplementation((args) => {
          if (args?.where?.action === 'skip') {
            return Promise.resolve(10);
          }
          return Promise.resolve(50);
        })
    },
    newsSentiment: {
      findFirst: jest.fn().mockResolvedValue({ score: 0.65 })
    },
    orderBookMetric: {
      findFirst: jest.fn().mockResolvedValue({ imbalance: 0.23 })
    }
  }
}));

// Import after mocking
import { FastifyInstance } from 'fastify';
import { registerMetricsRoute } from '../src/routes/metrics.js';

describe('Metrics Controller', () => {
  let app: FastifyInstance;
  let mockReply;
  
  beforeEach(() => {
    // Mock Fastify instance
    app = {
      get: jest.fn((path, handler) => {
        // Store the handler for testing
        app.routes = app.routes || {};
        app.routes[path] = handler;
      }),
      routes: {}
    } as unknown as FastifyInstance;
    
    // Mock reply
    mockReply = {
      code: jest.fn().mockReturnThis()
    };
  });
  
  it('should register the metrics route', async () => {
    await registerMetricsRoute(app);
    expect(app.get).toHaveBeenCalledWith('/metrics', expect.any(Function));
  });
  
  it('should return metrics data', async () => {
    await registerMetricsRoute(app);
    
    const handler = app.routes['/metrics'];
    const result = await handler({}, mockReply);
    
    expect(result).toEqual({
      equity: 15000,
      pnl: -750,
      drawdown: 5,
      tradeCount24h: 25,
      gatekeeperVetoRatio: 0.2,
      latestSentiment: 0.65,
      latestOrderBookImbalance: 0.23
    });
  });
}); 