import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db.js';

export async function registerMetricsRoute(fastify: FastifyInstance) {
  fastify.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get account state for equity
      const accountState = await prisma.accountState.findFirst();
      
      // Get latest portfolio metric for drawdown
      const latestMetric = await prisma.portfolioMetric.findFirst({
        orderBy: { date: 'desc' }
      });
      
      // Count trades in the last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentTrades = await prisma.strategyTrade.count({
        where: {
          ts: { gte: oneDayAgo }
        }
      });
      
      // Get gatekeeper veto ratio (skipped trades vs total)
      const allDatasets = await prisma.rLDataset.count({
        where: { ts: { gte: oneDayAgo } }
      });
      
      const skippedTrades = await prisma.rLDataset.count({
        where: { 
          ts: { gte: oneDayAgo },
          action: 'skip'
        }
      });
      
      const vetoRatio = allDatasets > 0 ? skippedTrades / allDatasets : 0;
      
      // Get latest sentiment
      const latestSentiment = await prisma.newsSentiment.findFirst({
        orderBy: { ts: 'desc' }
      });
      
      // Get latest order book imbalance
      const latestOrderBook = await prisma.orderBookMetric.findFirst({
        orderBy: { ts: 'desc' }
      });
      
      // Calculate drawdown
      const drawdown = latestMetric 
        ? ((latestMetric.equityStart - latestMetric.equityEnd) / latestMetric.equityStart) * 100
        : 0;
      
      return {
        equity: accountState?.equity || 0,
        pnl: latestMetric?.dailyPnl || 0,
        drawdown: drawdown > 0 ? drawdown : 0,
        tradeCount24h: recentTrades,
        gatekeeperVetoRatio: vetoRatio,
        latestSentiment: latestSentiment?.score || 0,
        latestOrderBookImbalance: latestOrderBook?.imbalance || 0
      };
    } catch (error) {
      console.error('Error fetching metrics:', error);
      reply.code(500);
      return { error: 'Failed to fetch metrics' };
    }
  });
} 