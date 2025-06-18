import type { FastifyInstance } from 'fastify';
import { createLogger, type EnhancedLogger } from '../utils/logger.js';
import { executionMonitor } from '../monitoring/executionMonitor.js';
import { prisma } from '../db.js';

const logger = createLogger('monitoringAPI') as EnhancedLogger;

export default async function monitoringRoutes(fastify: any) {
  
  /**
   * Get current execution pipeline metrics
   */
  fastify.get('/monitoring/metrics', async (request, reply) => {
    try {
      const metrics = executionMonitor.getMetricsSummary();
      
      logger.debug('📊 MONITORING API: Metrics summary requested', {
        endpoint: '/monitoring/metrics',
        metricsAvailable: Object.keys(metrics),
        requestTime: new Date().toISOString()
      });

      reply.status(200).send({
        success: true,
        data: {
          timestamp: Date.now(),
          ...metrics
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('❌ MONITORING API: Failed to get metrics', {
        endpoint: '/monitoring/metrics',
        error: errorMessage
      });

      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve monitoring metrics',
        details: errorMessage
      });
    }
  });

  /**
   * Get detailed trade execution metrics
   */
  fastify.get('/monitoring/trades', async (request, reply) => {
    try {
      const metrics = executionMonitor.getMetricsSummary();
      
      const tradeMetrics = {
        summary: metrics.trade,
        latency: metrics.latency,
        health: metrics.health,
        recentAlerts: metrics.activeAlerts.filter(alert => 
          alert.component === 'trade_success_rate' || 
          alert.component === 'execution_latency'
        )
      };

      logger.debug('📊 MONITORING API: Trade metrics requested', {
        endpoint: '/monitoring/trades',
        totalTrades: metrics.trade.totalTrades,
        successRate: metrics.trade.successRate
      });

      reply.status(200).send({
        success: true,
        data: tradeMetrics
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('❌ MONITORING API: Failed to get trade metrics', {
        endpoint: '/monitoring/trades',
        error: errorMessage
      });

      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve trade metrics',
        details: errorMessage
      });
    }
  });

  /**
   * Get database operation metrics
   */
  fastify.get('/monitoring/database', async (request, reply) => {
    try {
      const metrics = executionMonitor.getMetricsSummary();
      
             const dbMetrics = {
         summary: metrics.database,
         recentAlerts: metrics.activeAlerts.filter(alert => 
           alert.component === 'database_success_rate'
         ),
         recommendations: [] as string[]
       };

       // Add recommendations based on metrics
       if (metrics.database.successRate < 95 && metrics.database.totalOperations > 10) {
         dbMetrics.recommendations.push('Database success rate is below optimal (95%). Check connection stability.');
       }
       
       if (metrics.database.avgLatency > 1000) {
         dbMetrics.recommendations.push('Database latency is elevated. Consider query optimization.');
       }

      logger.debug('📊 MONITORING API: Database metrics requested', {
        endpoint: '/monitoring/database',
        totalOperations: metrics.database.totalOperations,
        successRate: metrics.database.successRate,
        avgLatency: metrics.database.avgLatency
      });

      reply.status(200).send({
        success: true,
        data: dbMetrics
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('❌ MONITORING API: Failed to get database metrics', {
        endpoint: '/monitoring/database',
        error: errorMessage
      });

      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve database metrics',
        details: errorMessage
      });
    }
  });

  /**
   * Get risk breach metrics
   */
  fastify.get('/monitoring/risk', async (request, reply) => {
    try {
      const metrics = executionMonitor.getMetricsSummary();
      
             const riskMetrics = {
         summary: metrics.risk,
         recentAlerts: metrics.activeAlerts.filter(alert => 
           alert.component === 'risk_breach_rate'
         ),
         recommendations: [] as string[]
       };

       // Add recommendations based on risk metrics
       if (metrics.risk.breachRate > 5) {
         riskMetrics.recommendations.push('Risk breach rate is elevated. Review risk management parameters.');
       }
       
       if (metrics.risk.criticalBreaches > 0) {
         riskMetrics.recommendations.push('Critical risk breaches detected. Immediate attention required.');
       }

      logger.debug('📊 MONITORING API: Risk metrics requested', {
        endpoint: '/monitoring/risk',
        totalRiskChecks: metrics.risk.totalRiskChecks,
        breachRate: metrics.risk.breachRate,
        criticalBreaches: metrics.risk.criticalBreaches
      });

      reply.status(200).send({
        success: true,
        data: riskMetrics
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('❌ MONITORING API: Failed to get risk metrics', {
        endpoint: '/monitoring/risk',
        error: errorMessage
      });

      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve risk metrics',
        details: errorMessage
      });
    }
  });

  /**
   * Get pipeline health status
   */
  fastify.get('/monitoring/health', async (request, reply) => {
    try {
      const metrics = executionMonitor.getMetricsSummary();
      
      const healthStatus = {
        status: metrics.health.status,
        score: metrics.health.score,
        issues: metrics.health.issues,
        uptime: metrics.uptime,
        lastHealthCheck: metrics.health.lastHealthCheck,
        components: {
          trades: {
            status: metrics.trade.successRate >= 90 ? 'healthy' : 
                   metrics.trade.successRate >= 70 ? 'degraded' : 'critical',
            successRate: metrics.trade.successRate,
            totalTrades: metrics.trade.totalTrades
          },
          database: {
            status: metrics.database.successRate >= 95 ? 'healthy' :
                   metrics.database.successRate >= 85 ? 'degraded' : 'critical',
            successRate: metrics.database.successRate,
            avgLatency: metrics.database.avgLatency
          },
          risk: {
            status: metrics.risk.breachRate <= 5 ? 'healthy' :
                   metrics.risk.breachRate <= 10 ? 'degraded' : 'critical',
            breachRate: metrics.risk.breachRate,
            criticalBreaches: metrics.risk.criticalBreaches
          }
        },
                 activeAlerts: metrics.activeAlerts.length,
         recommendations: [] as string[]
       };

       // Add health recommendations
       if (healthStatus.score < 80) {
         healthStatus.recommendations.push('Pipeline health is degraded. Review component issues.');
       }
       
       if (healthStatus.activeAlerts > 0) {
         healthStatus.recommendations.push(`${healthStatus.activeAlerts} active alerts require attention.`);
       }

      logger.debug('📊 MONITORING API: Health status requested', {
        endpoint: '/monitoring/health',
        status: healthStatus.status,
        score: healthStatus.score,
        activeAlerts: healthStatus.activeAlerts
      });

      reply.status(200).send({
        success: true,
        data: healthStatus
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('❌ MONITORING API: Failed to get health status', {
        endpoint: '/monitoring/health',
        error: errorMessage
      });

      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve health status',
        details: errorMessage
      });
    }
  });

  /**
   * Get active alerts
   */
  fastify.get('/monitoring/alerts', async (request, reply) => {
    try {
      const metrics = executionMonitor.getMetricsSummary();
      
      const alertsData = {
        active: metrics.activeAlerts,
        summary: {
          total: metrics.activeAlerts.length,
          critical: metrics.activeAlerts.filter(a => a.severity === 'critical').length,
          warning: metrics.activeAlerts.filter(a => a.severity === 'warning').length,
          info: metrics.activeAlerts.filter(a => a.severity === 'info').length
        },
        byComponent: {}
      };

      // Group alerts by component
      for (const alert of metrics.activeAlerts) {
        if (!alertsData.byComponent[alert.component]) {
          alertsData.byComponent[alert.component] = [];
        }
        alertsData.byComponent[alert.component].push(alert);
      }

      logger.debug('📊 MONITORING API: Alerts requested', {
        endpoint: '/monitoring/alerts',
        totalAlerts: alertsData.summary.total,
        criticalAlerts: alertsData.summary.critical
      });

      reply.status(200).send({
        success: true,
        data: alertsData
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('❌ MONITORING API: Failed to get alerts', {
        endpoint: '/monitoring/alerts',
        error: errorMessage
      });

      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve alerts',
        details: errorMessage
      });
    }
  });

  /**
   * Reset monitoring metrics (for testing)
   */
  fastify.post('/monitoring/reset', async (request, reply) => {
    try {
      executionMonitor.resetMetrics();
      
      logger.info('🔄 MONITORING API: Metrics reset requested', {
        endpoint: '/monitoring/reset',
        timestamp: new Date().toISOString()
      });

      reply.status(200).send({
        success: true,
        message: 'Monitoring metrics have been reset'
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('❌ MONITORING API: Failed to reset metrics', {
        endpoint: '/monitoring/reset',
        error: errorMessage
      });

      reply.status(500).send({
        success: false,
        error: 'Failed to reset monitoring metrics',
        details: errorMessage
      });
    }
  });

  /**
   * Get historical alert data from database
   */
  fastify.get('/monitoring/history/alerts', async (request, reply) => {
    try {
      const query = request.query as { limit?: string; hours?: string };
      const limit = parseInt(query.limit || '100');
      const hours = parseInt(query.hours || '24');
      
      const since = new Date(Date.now() - (hours * 60 * 60 * 1000));
      
             const historicalAlerts = await prisma.rLDataset.findMany({
         where: {
           symbol: 'monitoring_alert',
           ts: {
             gte: since
           }
         },
         orderBy: {
           ts: 'desc'
         },
         take: limit
       });

       const alerts = historicalAlerts.map(alert => {
         try {
           return {
             id: alert.id,
             timestamp: alert.ts,
             ...JSON.parse(alert.featureVec)
           };
         } catch (error) {
           logger.warn('Failed to parse historical alert data', {
             alertId: alert.id,
             error: error instanceof Error ? error.message : String(error)
           });
           return {
             id: alert.id,
             timestamp: alert.ts,
             error: 'Failed to parse alert data'
           };
         }
       });

      logger.debug('📊 MONITORING API: Historical alerts requested', {
        endpoint: '/monitoring/history/alerts',
        limit,
        hours,
        alertCount: alerts.length
      });

      reply.status(200).send({
        success: true,
        data: {
          alerts,
          query: { limit, hours, since },
          count: alerts.length
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('❌ MONITORING API: Failed to get historical alerts', {
        endpoint: '/monitoring/history/alerts',
        error: errorMessage
      });

      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve historical alerts',
        details: errorMessage
      });
    }
  });
} 