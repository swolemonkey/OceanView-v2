import { createLogger, type EnhancedLogger } from '../utils/logger.js';
import { notify } from '../ops/alertService.js';
import { prisma } from '../db.js';
import { randomUUID } from 'crypto';

// Enhanced logger for monitoring
const logger = createLogger('executionMonitor') as EnhancedLogger;

// Metric interfaces
interface TradeMetrics {
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  successRate: number;
  avgExecutionLatency: number;
  lastExecutionTime: number;
}

interface DatabaseMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  successRate: number;
  avgLatency: number;
  lastOperationTime: number;
}

interface RiskMetrics {
  totalRiskChecks: number;
  riskBreaches: number;
  warningCount: number;
  criticalBreaches: number;
  breachRate: number;
  lastBreachTime: number;
}

interface ExecutionLatencyMetrics {
  signalToOrder: number;
  orderToFill: number;
  fillToDatabase: number;
  totalPipeline: number;
  p95Latency: number;
  p99Latency: number;
}

interface PipelineHealth {
  status: 'healthy' | 'degraded' | 'critical';
  score: number; // 0-100
  issues: string[];
  uptime: number;
  lastHealthCheck: number;
}

interface MonitoringAlert {
  id: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'critical';
  component: string;
  message: string;
  metrics: any;
  resolved: boolean;
  resolvedAt?: number;
}

// Execution monitoring class
export class ExecutionPipelineMonitor {
  private static instance: ExecutionPipelineMonitor;
  
  // Metrics storage
  private tradeMetrics: TradeMetrics = {
    totalTrades: 0,
    successfulTrades: 0,
    failedTrades: 0,
    successRate: 100,
    avgExecutionLatency: 0,
    lastExecutionTime: 0
  };

  private databaseMetrics: DatabaseMetrics = {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    successRate: 100,
    avgLatency: 0,
    lastOperationTime: 0
  };

  private riskMetrics: RiskMetrics = {
    totalRiskChecks: 0,
    riskBreaches: 0,
    warningCount: 0,
    criticalBreaches: 0,
    breachRate: 0,
    lastBreachTime: 0
  };

  private latencyMetrics: ExecutionLatencyMetrics = {
    signalToOrder: 0,
    orderToFill: 0,
    fillToDatabase: 0,
    totalPipeline: 0,
    p95Latency: 0,
    p99Latency: 0
  };

  private pipelineHealth: PipelineHealth = {
    status: 'healthy',
    score: 100,
    issues: [],
    uptime: Date.now(),
    lastHealthCheck: Date.now()
  };

  // Tracking arrays for percentile calculations
  private latencyHistory: number[] = [];
  private dbLatencyHistory: number[] = [];
  private maxHistoryLength = 1000;

  // Active alerts
  private activeAlerts = new Map<string, MonitoringAlert>();
  
  // Monitoring configuration
  private config = {
    tradeSuccessThreshold: 90,    // % - alert if below
    dbSuccessThreshold: 95,       // % - alert if below  
    riskBreachThreshold: 5,       // % - alert if above
    latencyThreshold: 5000,       // ms - alert if above
    healthCheckInterval: 30000,   // 30 seconds
    alertCooldown: 300000,        // 5 minutes between same alerts
    metricsRetention: 24 * 60 * 60 * 1000, // 24 hours
  };

  private healthCheckTimer: NodeJS.Timeout | null = null;
  private startTime = Date.now();

  private constructor() {
    logger.info('🚀 EXECUTION MONITOR: Initializing Execution Pipeline Monitor', {
      config: this.config,
      startTime: new Date(this.startTime).toISOString()
    });
    
    this.startHealthChecks();
  }

  public static getInstance(): ExecutionPipelineMonitor {
    if (!ExecutionPipelineMonitor.instance) {
      ExecutionPipelineMonitor.instance = new ExecutionPipelineMonitor();
    }
    return ExecutionPipelineMonitor.instance;
  }

  /**
   * Record a trade execution attempt
   */
  recordTradeExecution(success: boolean, latency: number, details: any = {}) {
    const timestamp = Date.now();
    
    this.tradeMetrics.totalTrades++;
    this.tradeMetrics.lastExecutionTime = timestamp;
    
    if (success) {
      this.tradeMetrics.successfulTrades++;
    } else {
      this.tradeMetrics.failedTrades++;
    }
    
    // Update success rate
    this.tradeMetrics.successRate = (this.tradeMetrics.successfulTrades / this.tradeMetrics.totalTrades) * 100;
    
    // Update average latency
    this.updateLatencyMetrics(latency);
    
    // Log the execution
    if (success) {
      logger.info('✅ EXECUTION MONITOR: Trade execution successful', {
        tradeId: details.tradeId,
        symbol: details.symbol,
        latency: `${latency}ms`,
        totalTrades: this.tradeMetrics.totalTrades,
        successRate: `${this.tradeMetrics.successRate.toFixed(2)}%`
      });
    } else {
      logger.error('❌ EXECUTION MONITOR: Trade execution failed', {
        tradeId: details.tradeId,
        symbol: details.symbol,
        latency: `${latency}ms`,
        error: details.error,
        totalTrades: this.tradeMetrics.totalTrades,
        successRate: `${this.tradeMetrics.successRate.toFixed(2)}%`
      });
    }

    // Check for alerts
    this.checkTradeAlerts();
  }

  /**
   * Record a database operation
   */
  recordDatabaseOperation(operation: string, success: boolean, latency: number, details: any = {}) {
    const timestamp = Date.now();
    
    this.databaseMetrics.totalOperations++;
    this.databaseMetrics.lastOperationTime = timestamp;
    
    if (success) {
      this.databaseMetrics.successfulOperations++;
    } else {
      this.databaseMetrics.failedOperations++;
    }
    
    // Update success rate
    this.databaseMetrics.successRate = (this.databaseMetrics.successfulOperations / this.databaseMetrics.totalOperations) * 100;
    
    // Update average latency
    this.updateDbLatencyMetrics(latency);
    
    // Log the operation
    if (success) {
      logger.debug('💾 EXECUTION MONITOR: Database operation successful', {
        operation,
        latency: `${latency}ms`,
        table: details.table,
        totalOps: this.databaseMetrics.totalOperations,
        successRate: `${this.databaseMetrics.successRate.toFixed(2)}%`
      });
    } else {
      logger.error('❌ EXECUTION MONITOR: Database operation failed', {
        operation,
        latency: `${latency}ms`,
        table: details.table,
        error: details.error,
        totalOps: this.databaseMetrics.totalOperations,
        successRate: `${this.databaseMetrics.successRate.toFixed(2)}%`
      });
    }

    // Check for alerts
    this.checkDatabaseAlerts();
  }

  /**
   * Record a risk limit breach
   */
  recordRiskBreach(severity: 'warning' | 'critical', riskType: string, details: any = {}) {
    const timestamp = Date.now();
    
    this.riskMetrics.totalRiskChecks++;
    this.riskMetrics.lastBreachTime = timestamp;
    
    if (severity === 'critical') {
      this.riskMetrics.criticalBreaches++;
      this.riskMetrics.riskBreaches++;
    } else {
      this.riskMetrics.warningCount++;
    }
    
    // Update breach rate
    this.riskMetrics.breachRate = (this.riskMetrics.riskBreaches / this.riskMetrics.totalRiskChecks) * 100;
    
    // Log the breach
    if (severity === 'critical') {
      logger.error('🚨 EXECUTION MONITOR: Critical risk breach detected', {
        riskType,
        severity,
        checkId: details.checkId,
        symbol: details.symbol,
        current: details.current,
        limit: details.limit,
        totalBreaches: this.riskMetrics.riskBreaches,
        breachRate: `${this.riskMetrics.breachRate.toFixed(2)}%`
      });
    } else {
      logger.warn('⚠️ EXECUTION MONITOR: Risk warning detected', {
        riskType,
        severity,
        checkId: details.checkId,
        symbol: details.symbol,
        current: details.current,
        threshold: details.threshold,
        totalWarnings: this.riskMetrics.warningCount
      });
    }

    // Check for alerts
    this.checkRiskAlerts();
  }

  /**
   * Record execution pipeline latency breakdown
   */
  recordExecutionLatency(breakdown: Partial<ExecutionLatencyMetrics>) {
    // Update latency breakdown metrics
    if (breakdown.signalToOrder) this.latencyMetrics.signalToOrder = breakdown.signalToOrder;
    if (breakdown.orderToFill) this.latencyMetrics.orderToFill = breakdown.orderToFill;
    if (breakdown.fillToDatabase) this.latencyMetrics.fillToDatabase = breakdown.fillToDatabase;
    if (breakdown.totalPipeline) this.latencyMetrics.totalPipeline = breakdown.totalPipeline;

    logger.debug('⏱️ EXECUTION MONITOR: Execution latency breakdown', {
      signalToOrder: `${this.latencyMetrics.signalToOrder}ms`,
      orderToFill: `${this.latencyMetrics.orderToFill}ms`,
      fillToDatabase: `${this.latencyMetrics.fillToDatabase}ms`,
      totalPipeline: `${this.latencyMetrics.totalPipeline}ms`,
      p95: `${this.latencyMetrics.p95Latency}ms`,
      p99: `${this.latencyMetrics.p99Latency}ms`
    });

    // Check for latency alerts
    this.checkLatencyAlerts();
  }

  /**
   * Update latency metrics and percentiles
   */
  private updateLatencyMetrics(latency: number) {
    this.latencyHistory.push(latency);
    if (this.latencyHistory.length > this.maxHistoryLength) {
      this.latencyHistory.shift();
    }

    // Calculate average
    this.tradeMetrics.avgExecutionLatency = this.latencyHistory.reduce((sum, l) => sum + l, 0) / this.latencyHistory.length;
    
    // Calculate percentiles
    const sorted = [...this.latencyHistory].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);
    
    this.latencyMetrics.p95Latency = sorted[p95Index] || 0;
    this.latencyMetrics.p99Latency = sorted[p99Index] || 0;
  }

  /**
   * Update database latency metrics
   */
  private updateDbLatencyMetrics(latency: number) {
    this.dbLatencyHistory.push(latency);
    if (this.dbLatencyHistory.length > this.maxHistoryLength) {
      this.dbLatencyHistory.shift();
    }

    // Calculate average
    this.databaseMetrics.avgLatency = this.dbLatencyHistory.reduce((sum, l) => sum + l, 0) / this.dbLatencyHistory.length;
  }

  /**
   * Check for trade-related alerts
   */
  private checkTradeAlerts() {
    const successRate = this.tradeMetrics.successRate;
    
    if (successRate < this.config.tradeSuccessThreshold && this.tradeMetrics.totalTrades >= 10) {
      this.triggerAlert('critical', 'trade_success_rate', 
        `Trade success rate critical: ${successRate.toFixed(2)}% (threshold: ${this.config.tradeSuccessThreshold}%)`,
        {
          currentRate: successRate,
          threshold: this.config.tradeSuccessThreshold,
          totalTrades: this.tradeMetrics.totalTrades,
          failedTrades: this.tradeMetrics.failedTrades
        }
      );
    }
  }

  /**
   * Check for database-related alerts
   */
  private checkDatabaseAlerts() {
    const successRate = this.databaseMetrics.successRate;
    
    if (successRate < this.config.dbSuccessThreshold && this.databaseMetrics.totalOperations >= 10) {
      this.triggerAlert('critical', 'database_success_rate',
        `Database success rate critical: ${successRate.toFixed(2)}% (threshold: ${this.config.dbSuccessThreshold}%)`,
        {
          currentRate: successRate,
          threshold: this.config.dbSuccessThreshold,
          totalOperations: this.databaseMetrics.totalOperations,
          failedOperations: this.databaseMetrics.failedOperations
        }
      );
    }
  }

  /**
   * Check for risk-related alerts
   */
  private checkRiskAlerts() {
    const breachRate = this.riskMetrics.breachRate;
    
    if (breachRate > this.config.riskBreachThreshold && this.riskMetrics.totalRiskChecks >= 10) {
      this.triggerAlert('warning', 'risk_breach_rate',
        `Risk breach rate elevated: ${breachRate.toFixed(2)}% (threshold: ${this.config.riskBreachThreshold}%)`,
        {
          currentRate: breachRate,
          threshold: this.config.riskBreachThreshold,
          totalBreaches: this.riskMetrics.riskBreaches,
          criticalBreaches: this.riskMetrics.criticalBreaches
        }
      );
    }
  }

  /**
   * Check for latency-related alerts
   */
  private checkLatencyAlerts() {
    const p95Latency = this.latencyMetrics.p95Latency;
    
    if (p95Latency > this.config.latencyThreshold && this.latencyHistory.length >= 50) {
      this.triggerAlert('warning', 'execution_latency',
        `Execution latency elevated: P95 ${p95Latency}ms (threshold: ${this.config.latencyThreshold}ms)`,
        {
          p95Latency,
          p99Latency: this.latencyMetrics.p99Latency,
          avgLatency: this.tradeMetrics.avgExecutionLatency,
          threshold: this.config.latencyThreshold
        }
      );
    }
  }

  /**
   * Trigger a monitoring alert
   */
  private async triggerAlert(severity: 'info' | 'warning' | 'critical', component: string, message: string, metrics: any) {
    const alertKey = `${component}_${severity}`;
    const now = Date.now();
    
    // Check cooldown period
    const existingAlert = this.activeAlerts.get(alertKey);
    if (existingAlert && (now - existingAlert.timestamp) < this.config.alertCooldown) {
      return; // Skip alert due to cooldown
    }

    const alert: MonitoringAlert = {
      id: randomUUID(),
      timestamp: now,
      severity,
      component,
      message,
      metrics,
      resolved: false
    };

    this.activeAlerts.set(alertKey, alert);

    // Log the alert
    const logLevel = severity === 'critical' ? 'error' : severity === 'warning' ? 'warn' : 'info';
    logger[logLevel](`🚨 EXECUTION MONITOR ALERT: ${severity.toUpperCase()}`, {
      alertId: alert.id,
      component,
      message,
      metrics,
      timestamp: new Date(now).toISOString()
    });

    // Send external notification for critical alerts
    if (severity === 'critical') {
      try {
        await notify(`🚨 CRITICAL EXECUTION PIPELINE ALERT: ${message}`);
      } catch (error) {
        logger.error('Failed to send critical alert notification', {
          error: error instanceof Error ? error.message : String(error),
          alertId: alert.id
        });
      }
    }

    // Persist alert to database
    await this.persistAlert(alert);
  }

  /**
   * Persist alert to database
   */
  private async persistAlert(alert: MonitoringAlert) {
    try {
      await prisma.rLDataset.create({
        data: {
          symbol: 'monitoring_alert',
          featureVec: JSON.stringify({
            alertId: alert.id,
            severity: alert.severity,
            component: alert.component,
            message: alert.message,
            metrics: alert.metrics,
            timestamp: new Date(alert.timestamp).toISOString()
          }),
          action: `alert_${alert.severity}`,
          outcome: alert.severity === 'critical' ? -1 : alert.severity === 'warning' ? -0.5 : 0
        }
      });
    } catch (error) {
      logger.error('Failed to persist monitoring alert', {
        alertId: alert.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks() {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);

    logger.info('✅ EXECUTION MONITOR: Health checks started', {
      interval: `${this.config.healthCheckInterval}ms`,
      nextCheck: new Date(Date.now() + this.config.healthCheckInterval).toISOString()
    });
  }

  /**
   * Perform comprehensive health check
   */
  private performHealthCheck() {
    const now = Date.now();
    let score = 100;
    const issues: string[] = [];

    // Check trade success rate
    if (this.tradeMetrics.successRate < this.config.tradeSuccessThreshold && this.tradeMetrics.totalTrades >= 5) {
      score -= 30;
      issues.push(`Low trade success rate: ${this.tradeMetrics.successRate.toFixed(2)}%`);
    }

    // Check database success rate
    if (this.databaseMetrics.successRate < this.config.dbSuccessThreshold && this.databaseMetrics.totalOperations >= 5) {
      score -= 25;
      issues.push(`Low database success rate: ${this.databaseMetrics.successRate.toFixed(2)}%`);
    }

    // Check risk breach rate
    if (this.riskMetrics.breachRate > this.config.riskBreachThreshold && this.riskMetrics.totalRiskChecks >= 5) {
      score -= 20;
      issues.push(`High risk breach rate: ${this.riskMetrics.breachRate.toFixed(2)}%`);
    }

    // Check latency
    if (this.latencyMetrics.p95Latency > this.config.latencyThreshold && this.latencyHistory.length >= 10) {
      score -= 15;
      issues.push(`High execution latency: P95 ${this.latencyMetrics.p95Latency}ms`);
    }

    // Check if pipeline is stalled
    const timeSinceLastTrade = now - this.tradeMetrics.lastExecutionTime;
    if (this.tradeMetrics.totalTrades > 0 && timeSinceLastTrade > 300000) { // 5 minutes
      score -= 10;
      issues.push(`No recent trade activity: ${Math.floor(timeSinceLastTrade / 1000)}s ago`);
    }

    // Update health metrics
    this.pipelineHealth = {
      status: score >= 80 ? 'healthy' : score >= 50 ? 'degraded' : 'critical',
      score: Math.max(0, score),
      issues,
      uptime: now - this.startTime,
      lastHealthCheck: now
    };

    // Log health status
    const logLevel = this.pipelineHealth.status === 'critical' ? 'error' : this.pipelineHealth.status === 'degraded' ? 'warn' : 'debug';
    logger[logLevel](`🏥 EXECUTION MONITOR: Pipeline health check`, {
      status: this.pipelineHealth.status,
      score: this.pipelineHealth.score,
      issues: this.pipelineHealth.issues,
      uptime: `${Math.floor(this.pipelineHealth.uptime / 1000)}s`,
      tradeMetrics: this.tradeMetrics,
      databaseMetrics: this.databaseMetrics,
      riskMetrics: this.riskMetrics
    });

    // Trigger health alert if critical
    if (this.pipelineHealth.status === 'critical') {
      this.triggerAlert('critical', 'pipeline_health',
        `Pipeline health critical: Score ${this.pipelineHealth.score}/100`,
        {
          healthScore: this.pipelineHealth.score,
          issues: this.pipelineHealth.issues,
          uptime: this.pipelineHealth.uptime
        }
      );
    }
  }

  /**
   * Get current metrics summary
   */
  getMetricsSummary() {
    return {
      trade: this.tradeMetrics,
      database: this.databaseMetrics,
      risk: this.riskMetrics,
      latency: this.latencyMetrics,
      health: this.pipelineHealth,
      activeAlerts: Array.from(this.activeAlerts.values()).filter(a => !a.resolved),
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * Reset metrics (for testing or new trading session)
   */
  resetMetrics() {
    logger.info('🔄 EXECUTION MONITOR: Resetting all metrics', {
      previousTrades: this.tradeMetrics.totalTrades,
      previousDbOps: this.databaseMetrics.totalOperations,
      previousRiskChecks: this.riskMetrics.totalRiskChecks
    });

    // Reset all metrics to initial state
    Object.assign(this.tradeMetrics, {
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      successRate: 100,
      avgExecutionLatency: 0,
      lastExecutionTime: 0
    });

    Object.assign(this.databaseMetrics, {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      successRate: 100,
      avgLatency: 0,
      lastOperationTime: 0
    });

    Object.assign(this.riskMetrics, {
      totalRiskChecks: 0,
      riskBreaches: 0,
      warningCount: 0,
      criticalBreaches: 0,
      breachRate: 0,
      lastBreachTime: 0
    });

    // Clear history arrays
    this.latencyHistory = [];
    this.dbLatencyHistory = [];
    
    // Reset health
    this.pipelineHealth.score = 100;
    this.pipelineHealth.status = 'healthy';
    this.pipelineHealth.issues = [];

    // Clear active alerts
    this.activeAlerts.clear();
  }

  /**
   * Shutdown monitoring
   */
  destroy() {
    logger.info('🔄 EXECUTION MONITOR: Shutting down execution pipeline monitor', {
      uptime: Date.now() - this.startTime,
      totalTrades: this.tradeMetrics.totalTrades,
      totalDbOps: this.databaseMetrics.totalOperations,
      activeAlerts: this.activeAlerts.size
    });

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }
}

// Singleton instance getter
export const executionMonitor = ExecutionPipelineMonitor.getInstance(); 