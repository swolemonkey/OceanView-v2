import { executeIdea } from '@/bots/hypertrades/execution.js';
import { jest } from '@jest/globals';

// Setup mock
beforeEach(() => {
  global.fetch = jest.fn().mockImplementation(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ order: { price: 100 } })
  }));
});

// Clean up mock
afterEach(() => {
  jest.resetAllMocks();
});

test('splits large order into 3 chunks', async () => {
  const logs: any = [];
  await executeIdea({symbol: 'bitcoin', side: 'buy', qty: 0.05, price: 50000}, m => logs.push(m), 0);
  expect(global.fetch).toHaveBeenCalledTimes(3);
}); 