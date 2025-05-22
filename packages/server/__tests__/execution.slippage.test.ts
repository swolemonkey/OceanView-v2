import { placeSimOrder } from '../src/execution/sim.js';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { prisma } from '../src/db.js';

// Mock the prisma client
jest.mock('../src/db.js', () => ({
  prisma: {
    bot: {
      findUnique: jest.fn().mockResolvedValue({ equity: 10000 })
    },
    order: {
      create: jest.fn().mockImplementation(({ data }: { data: any }) => Promise.resolve({
        id: 1,
        ...data
      }))
    },
    trade: {
      create: jest.fn().mockResolvedValue({})
    }
  }
}));

// Mock setTimeout
jest.mock('timers', () => ({
  setTimeout: jest.fn((cb: () => void) => cb())
}));

describe('Execution with slippage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should add slippage of approximately 0.15% for a trade', async () => {
    // Parameters: equity = 10000, qty = 1, price = 10000
    const result = await placeSimOrder('bitcoin', 'buy', 1, 10000, 1);
    
    // Expect the fill price to be ≤ 10015 (price + 0.15%)
    expect(result.fill).toBeLessThanOrEqual(10015);
    expect(result.fill).toBeGreaterThan(10000);
    
    // Fee should be 0.04% of the fill price * qty
    expect(result.fee).toBeCloseTo(result.fill * 0.0004);
  });
}); 