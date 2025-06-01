/**
 * Evolution Test Script
 * 
 * A simplified version of the evolution process for testing
 */

import { prisma } from '../packages/server/src/db.js';
import { mutate, score } from '../packages/server/src/evolution/parameterManager.js';

// Define the child type interface
interface EvolutionChild {
  childId: number;
  parentId: number;
  sharpe: number;
  drawdown: number;
  childParams: any;
  promoted: boolean;
}

async function testEvolution() {
  console.log('[evolution-test] Starting test run');
  
  // Get current hyperSettings
  const hyperSettings = await prisma.hyperSettings.findUnique({ 
    where: { id: 1 } 
  });
  
  if (!hyperSettings) {
    console.error('[evolution-test] No HyperSettings found');
    return;
  }
  
  // Generate mock trades
  const trades = [
    { pnl: 10 },
    { pnl: 20 },
    { pnl: -5 },
    { pnl: 15 },
    { pnl: 8 }
  ];
  
  // Score the trades
  const metrics = score(trades);
  console.log('[evolution-test] Parent metrics:', metrics);
  
  // Create mutated parameters
  const parentParams = {
    smcThresh: 0.002,
    rsiOS: 35,
    rsiOB: 65,
    smcMinRetrace: 0.5
  };
  
  // Create 3 children with mutated parameters
  const children: EvolutionChild[] = [];
  for (let i = 0; i < 3; i++) {
    const childId = Date.now() + i;
    const childParams = mutate(parentParams);
    
    // Different trade results for each child
    const childTrades = [
      { pnl: 10 + i * 5 },
      { pnl: 20 + i * 2 },
      { pnl: -5 + i },
      { pnl: 15 + i * 3 },
      { pnl: 8 + i * 2 }
    ];
    
    const childMetrics = score(childTrades);
    
    children.push({
      childId,
      parentId: 1,
      sharpe: childMetrics.sharpe,
      drawdown: childMetrics.drawdown,
      childParams,
      promoted: false
    });
    
    console.log(`[evolution-test] Child ${i+1} metrics:`, childMetrics);
  }
  
  // Find best child
  let bestChild = children[0];
  for (const child of children) {
    if (child.sharpe > bestChild.sharpe && child.drawdown <= bestChild.drawdown * 1.2) {
      bestChild = child;
    }
  }
  
  // Save results to database
  for (const child of children) {
    // Use type assertion for Prisma client
    
    // @ts-ignore - New schema model not yet recognized by TypeScript
    await prisma.evolutionMetric.create({
      data: {
        parentId: child.parentId,
        childId: child.childId,
        sharpe: child.sharpe,
        drawdown: child.drawdown,
        childParams: child.childParams,
        promoted: child.childId === bestChild.childId
      }
    });
  }
  
  // Update best child params
  
  // @ts-ignore - strategyParams field not yet recognized by TypeScript
  await prisma.hyperSettings.update({
    where: { id: 1 },
    data: { strategyParams: bestChild.childParams }
  });
  
  console.log('[evolution-test] Best child promoted with sharpe:', bestChild.sharpe);
  console.log('[evolution-test] Test completed');
}

testEvolution()
  .then(() => {
    console.log('[evolution-test] Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[evolution-test] Error:', error);
    process.exit(1);
  }); 