#!/usr/bin/env ts-node

/**
 * Test script to verify the validation and verification system
 * This script tests:
 * 1. Trade validation after execution
 * 2. Pipeline health checks 
 * 3. Database operations verification
 */

import { validationOrchestrator, healthChecker, tradeValidator } from './packages/server/src/utils/validation.js';
import { createLogger } from './packages/server/src/utils/logger.js';

const logger = createLogger('validation-test');

async function testValidationSystem() {
  console.log('🧪 Testing Validation & Verification System\n');
  
  try {
    // Test 1: Pipeline Health Check
    console.log('📋 Test 1: Pipeline Health Check');
    console.log('-'.repeat(40));
    
    const healthResult = await healthChecker.checkPipelineHealth();
    console.log(`Overall Health: ${healthResult.overall.toUpperCase()}`);
    console.log(`Components: ${healthResult.summary.healthy} healthy, ${healthResult.summary.warning} warnings, ${healthResult.summary.critical} critical`);
    
    for (const component of healthResult.components) {
      const statusIcon = component.status === 'healthy' ? '✅' : 
                        component.status === 'warning' ? '⚠️' : '❌';
      console.log(`  ${statusIcon} ${component.component}: ${component.message}`);
    }
    console.log('');
    
    // Test 2: Trade Validation (Mock trade)
    console.log('📋 Test 2: Trade Validation');
    console.log('-'.repeat(40));
    
    const mockTradeId = `test_${Date.now()}`;
    const mockSymbol = 'BTCUSDT';
    const mockSide = 'buy' as const;
    const mockQty = 0.001;
    const mockPrice = 50000;
    
    console.log(`Testing validation for mock trade: ${mockSide.toUpperCase()} ${mockQty} ${mockSymbol} @ $${mockPrice}`);
    
    const validationResult = await validationOrchestrator.validateExecution(
      mockTradeId,
      mockSymbol,
      mockSide,
      mockQty,
      mockPrice,
      {
        shouldBeRecorded: false, // We're not actually placing a real trade
        expectedPnL: 0,
        expectedFee: 0
      }
    );
    
    console.log(`Validation Result: ${validationResult.success ? 'PASS' : 'FAIL'}`);
    console.log(`Message: ${validationResult.message}`);
    console.log('Individual Checks:');
    console.log(`  📊 Database Recorded: ${validationResult.checks.databaseRecorded ? 'PASS' : 'FAIL'}`);
    console.log(`  💰 Portfolio Updated: ${validationResult.checks.portfolioUpdated ? 'PASS' : 'FAIL'}`);
    console.log(`  ⚖️ Risk Limits Respected: ${validationResult.checks.riskLimitsRespected ? 'PASS' : 'FAIL'}`);
    console.log(`  🎯 Execution Matched: ${validationResult.checks.executionMatched ? 'PASS' : 'FAIL'}`);
    console.log('');
    
    // Test 3: Comprehensive Health Check with Details
    console.log('📋 Test 3: Detailed Component Health');
    console.log('-'.repeat(40));
    
    const detailedHealth = await validationOrchestrator.checkHealth();
    for (const component of detailedHealth.components) {
      console.log(`🔍 ${component.component.toUpperCase()}:`);
      console.log(`   Status: ${component.status}`);
      console.log(`   Message: ${component.message}`);
      console.log(`   Response Time: ${component.responseTime}ms`);
      if (component.details) {
        console.log(`   Details: ${JSON.stringify(component.details, null, 2)}`);
      }
      console.log('');
    }
    
    console.log('✅ Validation System Test Complete!');
    console.log(`Overall System Health: ${detailedHealth.overall.toUpperCase()}`);
    
    // Summary
    console.log('\n📊 SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Health Check: ${healthResult.overall === 'healthy' ? 'PASSED' : 'ISSUES DETECTED'}`);
    console.log(`✅ Trade Validation: ${validationResult.success ? 'FUNCTIONAL' : 'NEEDS ATTENTION'}`);
    console.log(`✅ Database Connectivity: ${detailedHealth.components.find(c => c.component === 'database')?.status === 'healthy' ? 'HEALTHY' : 'ISSUES'}`);
    console.log(`✅ Risk Management: ${detailedHealth.components.find(c => c.component === 'portfolio_risk')?.status === 'healthy' ? 'HEALTHY' : 'ISSUES'}`);
    console.log(`✅ RL Gatekeeper: ${detailedHealth.components.find(c => c.component === 'rl_gatekeeper')?.status === 'healthy' ? 'HEALTHY' : 'ISSUES'}`);
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    logger.error('Validation test failed', { 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

// Run the test
if (require.main === module) {
  testValidationSystem()
    .then(() => {
      console.log('\n🎉 Validation system test completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Validation system test failed:', error);
      process.exit(1);
    });
} 