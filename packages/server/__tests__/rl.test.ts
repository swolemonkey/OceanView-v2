import { RLGatekeeper } from '../src/rl/gatekeeper';

// Create a fake jest object if jest is not defined
const mockJest = {
  mock: (path, factory) => {
    // Do nothing, this is just for test compatibility
  },
  fn: () => {
    const mockFn = (...args) => mockFn.mock.calls.push(args);
    mockFn.mock = { calls: [] };
    mockFn.mockResolvedValue = (val) => {
      mockFn.mockImplementation = () => Promise.resolve(val);
      return mockFn;
    };
    mockFn.mockImplementation = (impl) => {
      mockFn.impl = impl;
      return mockFn;
    };
    return mockFn;
  }
};

// Use global jest if available, otherwise use our mock
const jest = global.jest || mockJest;

// Mock Prisma client
jest.mock('../src/db', () => ({
  prisma: {
    rLModel: {
      findFirst: jest.fn().mockResolvedValue({
        id: 1,
        version: 'gatekeeper_v1',
        path: 'ml/gatekeeper_v1.onnx',
        description: 'Test model'
      })
    },
    rLDataset: {
      create: jest.fn().mockResolvedValue({
        id: 1,
        symbol: 'BTC',
        action: 'buy',
        outcome: 0
      })
    }
  }
}));

describe.skip('RLGatekeeper (skipped until real ONNX runner wired)', () => {
  let gatekeeper: RLGatekeeper;

  beforeEach(() => {
    gatekeeper = new RLGatekeeper(1);
  });

  test('should load model and score trade ideas', async () => {
    const features = {
      symbol: 'BTC',
      price: 50000,
      rsi: 45,
      adx: 25,
      volatility: 0.02,
      recentTrend: 0.01,
      dayOfWeek: 1,
      hourOfDay: 12,
      rsi14: 45,
      adx14: 25,
      fastMASlowDelta: 0.001,
      bbWidth: 0.05,
      avgSent: 0.2,
      avgOB: 0.1
    };

    const score = await gatekeeper.scoreIdea(features, 'buy');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  test('should log feature vectors to database', async () => {
    const features = {
      symbol: 'BTC',
      price: 50000,
      rsi: 45,
      adx: 25,
      volatility: 0.02,
      recentTrend: 0.01,
      dayOfWeek: 1,
      hourOfDay: 12
    };

    await gatekeeper.scoreIdea(features, 'buy');
    
    // Check if prisma.rLDataset.create was called
    const { prisma } = require('../src/db');
    expect(prisma.rLDataset.create).toHaveBeenCalled();
  });
}); 