import { FastifyInstance } from 'fastify';
import RedisMock from 'ioredis-mock';
import { prisma } from '../db.js';

// Use Redis mock for development
const redis = new RedisMock();

export async function registerLatestPriceRoute(app: FastifyInstance) {
  app.get('/api/prices/latest', async (req, reply) => {
    const symbol = (req.query as any).symbol as string;
    if (!symbol) return reply.code(400).send({ error: 'symbol required' });

    // 1) try Redis stream
    const res = await redis.xrevrange('ticks:crypto', '+', '-', 'COUNT', 100);
    for (const [, fields] of res) {
      const idx = fields.indexOf('symbol');
      if (idx !== -1 && fields[idx + 1] === symbol) {
        const price = Number(fields[fields.indexOf('price') + 1]);
        return { symbol, price, source: 'redis' };
      }
    }

    // 2) fallback DB
    const row = await prisma.price1m.findFirst({
      where: { symbol },
      orderBy: { timestamp: 'desc' },
    });
    if (!row) return reply.code(404).send({ error: 'not found' });

    return { symbol, price: Number(row.close), source: 'db' };
  });
} 