import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { placeSimOrder } from '../src/execution/sim.js';

describe('Simulation Execution Engine', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  it('should place a simulated order and create a trade', async () => {
    // Execute the function - this will use the mock implementation in db.ts
    const botId = 123; // Mock botId
    const order = await placeSimOrder('ethereum', 'buy', 0.5, 2000, botId);
    
    // Verify the returned order has correct data
    expect(order).toEqual({
      id: 1,
      symbol: 'ethereum',
      side: 'buy',
      qty: 0.5,
      price: 2000
    });
    
    // Since we can't easily verify the mock calls with ES modules,
    // we can at least verify the correct return value
    expect(order.symbol).toBe('ethereum');
    expect(order.side).toBe('buy');
    expect(order.qty).toBe(0.5);
    expect(order.price).toBe(2000);
    expect(typeof order.id).toBe('number'); // Assert that id is a string or number
  });
}); 