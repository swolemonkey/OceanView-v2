import { FastifyInstance } from 'fastify';
// Import only the default function from ioredis-mock
import IoRedisMock from 'ioredis-mock';
import { prisma } from '../db.js';
import * as pino from 'pino';

// Initialize logger
const logger = pino.pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

// Use Redis mock for development
// @ts-ignore - Working around type issues with ioredis-mock
const redis = new IoRedisMock();

export async function registerLatestPriceRoute(app: any) {
  app.get('/api/prices/latest', async (req, reply) => {
    const symbol = (req.query as any).symbol as string;
    logger.info(`Price request received for symbol: ${symbol}`);
    
    if (!symbol) return reply.code(400).send({ error: 'symbol required' });

    // Inspect hash store first 
    try {
      const hashData = await redis.hgetall('latest:crypto');
      logger.info(`Redis hash data for latest prices: ${JSON.stringify(hashData)}`);
      
      if (hashData && hashData[symbol]) {
        const price = Number(hashData[symbol]);
        logger.info(`Found ${symbol} hash price in Redis: ${price}`);
        return { symbol, price, source: 'redis-hash' };
      }
    } catch (error) {
      logger.error(`Error getting hash data: ${error}`);
    }

    // 1) try Redis stream
    const res = await redis.xrevrange('ticks:crypto', '+', '-', 'COUNT', 100);
    logger.info(`Redis stream check for ${symbol}, found ${res.length} entries`);
    
    // Debug log all stream entries
    for (let i = 0; i < Math.min(res.length, 5); i++) {
      logger.info(`Stream entry ${i}: ${JSON.stringify(res[i])}`);
    }
    
    for (const [, fields] of res) {
      const idx = fields.indexOf('symbol');
      if (idx !== -1 && fields[idx + 1] === symbol) {
        const price = Number(fields[fields.indexOf('price') + 1]);
        logger.info(`Found ${symbol} price in Redis: ${price}`);
        return { symbol, price, source: 'redis' };
      }
    }

    // 2) fallback DB
    logger.info(`No price found in Redis for ${symbol}, falling back to DB`);
    const row = await prisma.price1m.findFirst({
      where: { symbol },
      orderBy: { timestamp: 'desc' },
    });
    
    if (!row) {
      logger.warn(`No data found for ${symbol} in DB`);
      return reply.code(404).send({ error: 'not found' });
    }

    logger.info(`Found ${symbol} price in DB: ${Number(row.close)}`);
    return { symbol, price: Number(row.close), source: 'db' };
  });
} 