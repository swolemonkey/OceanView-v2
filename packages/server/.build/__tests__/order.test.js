import Fastify from 'fastify';
import { registerOrderRoute } from '../src/routes/order.js';
import { describe, it, expect } from '@jest/globals';
describe('/api/order', () => {
    it('returns 200 for valid order', async () => {
        const app = Fastify();
        await registerOrderRoute(app);
        const res = await app.inject({
            method: 'POST',
            url: '/api/order',
            payload: { symbol: 'bitcoin', side: 'buy', qty: 0.1, price: 123 }
        });
        expect(res.statusCode).toBe(200);
        const json = res.json();
        expect(json.ok).toBe(true);
        expect(json.order.symbol).toBe('bitcoin');
        expect(json.order.side).toBe('buy');
        expect(json.order.qty).toBe(0.1);
        expect(json.order.price).toBe(123);
    });
    it('missing fields ⇒ 400', async () => {
        const app = Fastify();
        await registerOrderRoute(app);
        const res = await app.inject({
            method: 'POST',
            url: '/api/order',
            payload: { symbol: 'bitcoin' }
        });
        expect(res.statusCode).toBe(400);
    });
});
