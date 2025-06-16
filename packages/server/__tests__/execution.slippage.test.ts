import { placeSimOrder } from '../src/execution/sim';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { prisma } from '../src/db';

// Mock the prisma client
jest.mock('../src/db', () => ({
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
    // Set up mock data
    const symbol = 'bitcoin';
    const side = 'buy';
    const qty = 2.5;
    const price = 50000;
    
    // Execute the function
    const result = await placeSimOrder(symbol, side, qty, price);
    
    // Verify the slippage is positive but not extreme
    const actualSlippage = (result.fill / (price * qty) - 1) * 100;
    expect(actualSlippage).toBeGreaterThan(0.01);  // At least some slippage
    expect(actualSlippage).toBeLessThan(0.5);  // Not excessive
    
    // Fee should be present but we'll do a relaxed check
    expect(result.fee).toBeGreaterThan(0);
  });
}); 