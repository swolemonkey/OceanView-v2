import { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

export async function registerPortfolioRoute(app: FastifyInstance) {
  app.get('/api/portfolio', async (_, reply) => {
    const rows = await prisma.bot.findMany({ where: { enabled: true } });
    const totalEquity = rows.reduce((a, b) => a + b.equity, 0);
    const dayPnl = rows.reduce((a, b) => a + (b.pnlToday || 0), 0);
    return { totalEquity, dayPnl };
  });
} 