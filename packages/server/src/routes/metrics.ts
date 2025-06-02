import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db.js';

interface MetricsResponse {
  equity: number;
  pnl: number;
  drawdown: number;
  tradeCount24h: number;
  gatekeeperVetoRatio: number;
  latestSentiment: number;
  latestOrderBookImbalance: number;
  tradeActions: {
    executed: number;
    skip: number;
    blocked_rr: number;
    blocked_risk: number;
  };
}

export async function registerMetricsRoute(fastify: FastifyInstance) {
  fastify.get('/metrics', async (request: FastifyRequest, reply: FastifyReply): Promise<MetricsResponse | { error: string }> => {
    try {
      // Get account state for equity
      const accountState = await (prisma as any).accountState.findFirst();
      
      // Get latest portfolio metric for drawdown
      const latestMetric = await (prisma as any).portfolioMetric.findFirst({
        orderBy: { date: 'desc' }
      });
      
      // Count trades in the last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentTrades = await (prisma as any).strategyTrade.count({
        where: {
          ts: { gte: oneDayAgo }
        }
      });
      
      // Get gatekeeper veto ratio (skipped trades vs total)
      const allDatasets = await (prisma as any).rLDataset.count({
        where: { ts: { gte: oneDayAgo } }
      });
      
      const skippedTrades = await (prisma as any).rLDataset.count({
        where: { 
          ts: { gte: oneDayAgo },
          action: 'skip'
        }
      });
      
      // Count different trade actions
      const executedTrades = await (prisma as any).rLDataset.count({
        where: { 
          ts: { gte: oneDayAgo },
          action: { in: ['buy', 'sell'] }
        }
      });
      
      const blockedRRTrades = await (prisma as any).rLDataset.count({
        where: { 
          ts: { gte: oneDayAgo },
          action: 'blocked_rr'
        }
      });
      
      const blockedRiskTrades = await (prisma as any).rLDataset.count({
        where: { 
          ts: { gte: oneDayAgo },
          action: 'blocked_risk'
        }
      });
      
      const vetoRatio = allDatasets > 0 ? skippedTrades / allDatasets : 0;
      
      // Get latest sentiment
      const latestSentiment = await (prisma as any).newsSentiment.findFirst({
        orderBy: { ts: 'desc' }
      });
      
      // Get latest order book imbalance
      const latestOrderBook = await (prisma as any).orderBookMetric.findFirst({
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
        latestOrderBookImbalance: latestOrderBook?.imbalance || 0,
        tradeActions: {
          executed: executedTrades,
          skip: skippedTrades,
          blocked_rr: blockedRRTrades,
          blocked_risk: blockedRiskTrades
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error fetching metrics:', errorMessage);
      reply.code(500);
      return { error: 'Failed to fetch metrics' };
    }
  });
}

export default registerMetricsRoute; 