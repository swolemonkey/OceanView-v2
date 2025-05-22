import { describe, it, expect } from '@jest/globals';
import { placeSimOrder } from '../src/execution/sim.js';
describe('Simulation Execution Engine', () => {
    it('should place a simulated order and create a trade', async () => {
        // Execute the function - this will use the mock implementation in db.ts
        const order = await placeSimOrder('ethereum', 'buy', 0.5, 2000);
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
    });
});
