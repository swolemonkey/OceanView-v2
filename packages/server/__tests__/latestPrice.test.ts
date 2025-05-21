import Fastify from 'fastify';
import { registerLatestPriceRoute } from '../src/routes/latestPrice.js';
import { test, expect } from '@jest/globals';

test('returns latest price from redis', async () => {
  const app = Fastify();
  await registerLatestPriceRoute(app);

  const res = await app.inject({ method:'GET', url:'/api/prices/latest?symbol=bitcoin' });
  expect(res.statusCode).toBe(200);
  const json = res.json();
  expect(json.price).toBe(12345);
  expect(json.source).toBe('redis');
}); 