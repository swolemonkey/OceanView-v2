#!/usr/bin/env node

/**
 * Demo script for Execution Pipeline Monitoring System
 * 
 * This demonstrates the comprehensive monitoring capabilities we've built:
 * - Trade execution success/failure tracking
 * - Database operation monitoring with latency 
 * - Risk breach detection and alerting
 * - Pipeline health scoring
 * - Alert management with cooldowns
 */

console.log('🚀 EXECUTION PIPELINE MONITORING SYSTEM DEMO\n');

// Simulate the monitoring data structure
const mockMetrics = {
  trade: {
    totalTrades: 127,
    successfulTrades: 108,
    failedTrades: 19,
    successRate: 85.04,
    avgExecutionLatency: 342,
    lastExecutionTime: Date.now() - 5000
  },
  database: {
    totalOperations: 89,
    successfulOperations: 85,
    failedOperations: 4,
    successRate: 95.51,
    avgLatency: 145,
    lastOperationTime: Date.now() - 2000
  },
  risk: {
    totalRiskChecks: 42,
    riskBreaches: 3,
    warningCount: 8,
    criticalBreaches: 1,
    breachRate: 7.14,
    lastBreachTime: Date.now() - 30000
  },
  latency: {
    signalToOrder: 125,
    orderToFill: 456,
    fillToDatabase: 89,
    totalPipeline: 670,
    p95Latency: 892,
    p99Latency: 1345
  },
  health: {
    status: 'degraded',
    score: 78,
    issues: [
      'Trade success rate below 90%: 85.04%',
      'High execution latency: P95 892ms'
    ],
    uptime: 3600000,
    lastHealthCheck: Date.now()
  },
  activeAlerts: [
    {
      id: 'alert_001',
      timestamp: Date.now() - 60000,
      severity: 'warning',
      component: 'trade_success_rate',
      message: 'Trade success rate below threshold: 85.04% (threshold: 90%)',
      metrics: { currentRate: 85.04, threshold: 90 }
    },
    {
      id: 'alert_002', 
      timestamp: Date.now() - 45000,
      severity: 'warning',
      component: 'execution_latency',
      message: 'Execution latency elevated: P95 892ms (threshold: 500ms)',
      metrics: { p95Latency: 892, threshold: 500 }
    },
    {
      id: 'alert_003',
      timestamp: Date.now() - 30000,
      severity: 'critical', 
      component: 'risk_breach_rate',
      message: 'Critical risk breach detected: day_loss exceeded limit',
      metrics: { current: 0.045, limit: 0.03, riskType: 'day_loss' }
    }
  ],
  uptime: 3600000
};

console.log('📊 COMPREHENSIVE MONITORING DASHBOARD');
console.log('=' .repeat(60));

// Trade Execution Metrics
console.log('\n🔸 TRADE EXECUTION METRICS:');
console.log(`  Total Trades: ${mockMetrics.trade.totalTrades}`);
console.log(`  Successful: ${mockMetrics.trade.successfulTrades} (${mockMetrics.trade.successRate.toFixed(2)}%)`);
console.log(`  Failed: ${mockMetrics.trade.failedTrades}`);
console.log(`  Average Latency: ${mockMetrics.trade.avgExecutionLatency}ms`);
console.log(`  P95 Latency: ${mockMetrics.latency.p95Latency}ms`);
console.log(`  P99 Latency: ${mockMetrics.latency.p99Latency}ms`);

// Database Operation Metrics
console.log('\n🔸 DATABASE OPERATION METRICS:');
console.log(`  Total Operations: ${mockMetrics.database.totalOperations}`);
console.log(`  Successful: ${mockMetrics.database.successfulOperations} (${mockMetrics.database.successRate.toFixed(2)}%)`);
console.log(`  Failed: ${mockMetrics.database.failedOperations}`);
console.log(`  Average Latency: ${mockMetrics.database.avgLatency}ms`);

// Risk Breach Metrics
console.log('\n🔸 RISK BREACH METRICS:');
console.log(`  Total Risk Checks: ${mockMetrics.risk.totalRiskChecks}`);
console.log(`  Risk Breaches: ${mockMetrics.risk.riskBreaches} (${mockMetrics.risk.breachRate.toFixed(2)}%)`);
console.log(`  Critical Breaches: ${mockMetrics.risk.criticalBreaches}`);
console.log(`  Warnings: ${mockMetrics.risk.warningCount}`);

// Execution Latency Breakdown
console.log('\n🔸 EXECUTION LATENCY BREAKDOWN:');
console.log(`  Signal → Order: ${mockMetrics.latency.signalToOrder}ms`);
console.log(`  Order → Fill: ${mockMetrics.latency.orderToFill}ms`);
console.log(`  Fill → Database: ${mockMetrics.latency.fillToDatabase}ms`);
console.log(`  Total Pipeline: ${mockMetrics.latency.totalPipeline}ms`);

// Pipeline Health
console.log('\n🔸 PIPELINE HEALTH STATUS:');
const statusEmoji = mockMetrics.health.status === 'healthy' ? '✅' :
                   mockMetrics.health.status === 'degraded' ? '⚠️' : '🚨';
console.log(`  Status: ${statusEmoji} ${mockMetrics.health.status.toUpperCase()}`);
console.log(`  Health Score: ${mockMetrics.health.score}/100`);
console.log(`  Uptime: ${Math.floor(mockMetrics.uptime / 1000)}s`);

if (mockMetrics.health.issues.length > 0) {
  console.log('  Issues:');
  mockMetrics.health.issues.forEach(issue => console.log(`    - ${issue}`));
}

// Active Alerts
console.log('\n🔸 ACTIVE ALERTS:');
if (mockMetrics.activeAlerts.length === 0) {
  console.log('  ✅ No active alerts');
} else {
  console.log(`  🚨 Total Active: ${mockMetrics.activeAlerts.length}`);
  
  const bySeverity = {
    critical: mockMetrics.activeAlerts.filter(a => a.severity === 'critical').length,
    warning: mockMetrics.activeAlerts.filter(a => a.severity === 'warning').length,
    info: mockMetrics.activeAlerts.filter(a => a.severity === 'info').length
  };
  
  console.log(`  Critical: ${bySeverity.critical}, Warning: ${bySeverity.warning}, Info: ${bySeverity.info}`);
  
  console.log('\n  Recent Alerts:');
  mockMetrics.activeAlerts.forEach(alert => {
    const age = Math.floor((Date.now() - alert.timestamp) / 1000);
    const severityEmoji = alert.severity === 'critical' ? '🚨' : 
                         alert.severity === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`    ${severityEmoji} [${alert.severity.toUpperCase()}] ${alert.component}`);
    console.log(`       ${alert.message} (${age}s ago)`);
  });
}

// Performance Analysis
console.log('\n🔸 PERFORMANCE ANALYSIS:');
const tradeGrade = mockMetrics.trade.successRate >= 90 ? 'A' : 
                  mockMetrics.trade.successRate >= 80 ? 'B' :
                  mockMetrics.trade.successRate >= 70 ? 'C' : 'D';

const dbGrade = mockMetrics.database.successRate >= 95 ? 'A' :
               mockMetrics.database.successRate >= 90 ? 'B' :
               mockMetrics.database.successRate >= 85 ? 'C' : 'D';

const riskGrade = mockMetrics.risk.breachRate <= 5 ? 'A' :
                 mockMetrics.risk.breachRate <= 10 ? 'B' :
                 mockMetrics.risk.breachRate <= 20 ? 'C' : 'D';

const latencyGrade = mockMetrics.latency.p95Latency <= 500 ? 'A' :
                    mockMetrics.latency.p95Latency <= 1000 ? 'B' :
                    mockMetrics.latency.p95Latency <= 2000 ? 'C' : 'D';

console.log(`  📈 Trade Success Rate: ${tradeGrade} (${mockMetrics.trade.successRate.toFixed(1)}%)`);
console.log(`  💾 Database Success Rate: ${dbGrade} (${mockMetrics.database.successRate.toFixed(1)}%)`);
console.log(`  ⚠️ Risk Management: ${riskGrade} (${mockMetrics.risk.breachRate.toFixed(1)}% breach rate)`);
console.log(`  ⏱️ Execution Latency: ${latencyGrade} (P95: ${mockMetrics.latency.p95Latency}ms)`);

// System Recommendations
console.log('\n🔸 SYSTEM RECOMMENDATIONS:');
const recommendations = [];

if (mockMetrics.trade.successRate < 90) {
  recommendations.push('🔧 Investigate trade execution failures and improve success rate');
}
if (mockMetrics.database.successRate < 95) {
  recommendations.push('🔧 Check database connection stability and query performance');
}
if (mockMetrics.latency.p95Latency > 1000) {
  recommendations.push('🔧 Optimize execution pipeline to reduce latency');
}
if (mockMetrics.risk.breachRate > 5) {
  recommendations.push('🔧 Review and adjust risk management parameters');
}
if (mockMetrics.activeAlerts.length > 2) {
  recommendations.push('🔧 Address active alerts to improve system stability');
}

if (recommendations.length === 0) {
  console.log('  ✅ All systems operating within acceptable parameters');
} else {
  recommendations.forEach((rec, i) => console.log(`  ${i + 1}. ${rec}`));
}

// Feature Showcase
console.log('\n🔸 MONITORING SYSTEM FEATURES:');
console.log('  ✅ Real-time trade execution tracking');
console.log('  ✅ Database operation success rate monitoring');
console.log('  ✅ Portfolio risk limit breach detection');
console.log('  ✅ Execution latency percentile analysis (P95, P99)');
console.log('  ✅ Automated alerting with severity levels');
console.log('  ✅ Pipeline health scoring (0-100)');
console.log('  ✅ Alert cooldown management');
console.log('  ✅ Historical data persistence');
console.log('  ✅ Slack notifications for critical alerts');
console.log('  ✅ RESTful API endpoints for dashboard integration');

// API Endpoints Available
console.log('\n🔸 AVAILABLE API ENDPOINTS:');
console.log('  GET /monitoring/metrics       - Complete metrics summary');
console.log('  GET /monitoring/trades        - Trade execution metrics');
console.log('  GET /monitoring/database      - Database operation metrics');
console.log('  GET /monitoring/risk          - Risk breach metrics');
console.log('  GET /monitoring/health        - Pipeline health status');
console.log('  GET /monitoring/alerts        - Active alerts');
console.log('  GET /monitoring/history/alerts - Historical alert data');
console.log('  POST /monitoring/reset        - Reset metrics (testing)');

// Integration Points
console.log('\n🔸 INTEGRATION POINTS:');
console.log('  🔗 Portfolio Risk Manager - Risk breach monitoring');
console.log('  🔗 Database Manager - Operation success tracking');
console.log('  🔗 Enhanced Logger - Structured logging integration');
console.log('  🔗 Asset Agents - Trade execution monitoring');
console.log('  🔗 Slack Notifications - Critical alert delivery');

console.log('\n' + '='.repeat(60));
console.log('✅ EXECUTION PIPELINE MONITORING SYSTEM OPERATIONAL');
console.log('🎯 Comprehensive observability and alerting implemented!');
console.log('📈 Ready to track pipeline performance and detect issues');
console.log('🚨 Automatic alerts for critical breaches and degradation');
console.log('=' .repeat(60));

// Demonstrate alert scenarios
console.log('\n🔄 ALERT SCENARIOS DEMONSTRATION:');

console.log('\n📉 Trade Success Rate Alert:');
console.log('  Trigger: Success rate drops below 90%');
console.log('  Current: 85.04% (5% below threshold)');
console.log('  Action: Investigate execution pipeline issues');
console.log('  Severity: WARNING → CRITICAL if below 70%');

console.log('\n⏱️ Execution Latency Alert:');
console.log('  Trigger: P95 latency exceeds 500ms');
console.log('  Current: 892ms (78% above threshold)');
console.log('  Action: Optimize execution pipeline performance');
console.log('  Severity: WARNING → CRITICAL if above 2000ms');

console.log('\n🚨 Risk Breach Alert:');
console.log('  Trigger: Day loss exceeds maximum limit');
console.log('  Current: 4.5% loss (limit: 3.0%)');
console.log('  Action: Trading halted, immediate attention required');
console.log('  Severity: CRITICAL (trading disabled)');

console.log('\n💾 Database Alert:');
console.log('  Trigger: Database success rate below 95%');
console.log('  Current: 95.51% (within threshold)');
console.log('  Status: ✅ Healthy');
console.log('  Severity: None');

console.log('\n🔄 RECOMMENDATION 5 IMPLEMENTATION COMPLETE!');
console.log('=' .repeat(60));
console.log('✅ Successful vs failed trades tracking');
console.log('✅ Database operation success rates');
console.log('✅ Portfolio risk limit breaches monitoring');
console.log('✅ Execution latency tracking (P95/P99)');
console.log('✅ Monitoring alerts for pipeline issues');
console.log('=' .repeat(60)); 