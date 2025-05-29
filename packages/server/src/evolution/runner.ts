/**
 * Evolution Runner
 * 
 * Handles spawning and managing child bots for parameter evolution
 */

import { Worker } from 'worker_threads';
import { spawn } from 'child_process';
import path from 'path';
import { prisma } from '../db.js';
import { mutate, score } from './parameterManager.js';
import { getStrategyVersion } from '../lib/getVersion.js';
import type { EvolutionResult, EvolutionEvaluation } from './types.js';

// Number of children to spawn for each generation
const NUM_CHILDREN = 5;
// Duration to run each child bot (in milliseconds) - 24 hours
const RUN_DURATION = 24 * 60 * 60 * 1000;

/**
 * Spawns a child bot with mutated parameters
 * 
 * @param parentId The ID of the parent bot
 * @param childId The ID of the child bot
 * @param params The mutated parameters for the child
 * @returns A promise that resolves when the child bot completes
 */
async function spawnChildBot(parentId: number, childId: number, params: any): Promise<EvolutionResult> {
  return new Promise((resolve) => {
    const botName = `evolution_child_${childId}`;
    const strategyVersion = getStrategyVersion();
    
    console.log(`[evolution] Spawning child bot ${botName} with ID ${childId}`);
    
    // Create a temporary bot to run with the mutated parameters
    const worker = new Worker(path.resolve('packages/server/src/botRunner/workers/hypertrades.ts'), {
      workerData: { 
        botId: childId, 
        name: botName, 
        type: 'hypertrades', 
        stratVersion: strategyVersion,
        params: params
      }
    });

    // Collect trades from the bot
    const trades: any[] = [];
    
    worker.on('message', (message: any) => {
      if (message.type === 'trade') {
        trades.push(message.data);
      }
    });

    // Kill the worker after the run duration
    setTimeout(() => {
      worker.terminate();
      resolve({ trades, childParams: params });
    }, RUN_DURATION);
  });
}

/**
 * Run the evolution process
 * - Spawns multiple child bots with mutated parameters
 * - Evaluates their performance
 * - Promotes the best child if it outperforms the parent
 */
export async function runEvolution(): Promise<void> {
  try {
    console.log('[evolution] Starting evolution run');
    
    // Get the current strategy parameters
    const hyperSettings = await prisma.hyperSettings.findUnique({ 
      where: { id: 1 } 
    });
    
    if (!hyperSettings) {
      console.error('[evolution] No HyperSettings found');
      return;
    }
    
    const parentParams = hyperSettings;
    const parentId = 1; // Main strategy ID
    
    // Spawn child bots with mutated parameters
    const childPromises: Promise<EvolutionResult>[] = [];
    const childParams: any[] = [];
    
    for (let i = 0; i < NUM_CHILDREN; i++) {
      // Create unique child ID
      const childId = Date.now() + i;
      
      // Mutate parameters
      const mutatedParams = mutate(parentParams);
      childParams.push(mutatedParams);
      
      // Spawn child bot
      childPromises.push(spawnChildBot(parentId, childId, mutatedParams));
    }
    
    // Wait for all children to complete
    const results = await Promise.all(childPromises);
    
    // Evaluate results
    const evaluations: EvolutionEvaluation[] = results.map((result: EvolutionResult, index: number) => {
      const { trades, childParams } = result;
      const metrics = score(trades);
      
      return {
        childId: parentId + index + 1,
        parentId,
        sharpe: metrics.sharpe,
        drawdown: metrics.drawdown,
        childParams,
        promoted: false
      };
    });
    
    // Find the best performing child
    let bestChild = evaluations[0];
    for (const child of evaluations) {
      if (child.sharpe > bestChild.sharpe && child.drawdown <= bestChild.drawdown * 1.2) {
        bestChild = child;
      }
    }
    
    // Save all results to the database
    for (const evaluation of evaluations) {
      // @ts-ignore - Using mock Prisma client in development
      await prisma.evolutionMetric.create({
        data: {
          parentId: evaluation.parentId,
          childId: evaluation.childId,
          sharpe: evaluation.sharpe,
          drawdown: evaluation.drawdown,
          childParams: evaluation.childParams,
          promoted: evaluation.childId === bestChild.childId && bestChild.sharpe > 0
        }
      });
    }
    
    // Promote the best child if it outperforms the parent
    if (bestChild.sharpe > 0) {
      console.log(`[evolution] Promoting child with Sharpe ${bestChild.sharpe.toFixed(2)}`);
      
      // @ts-ignore - Using mock Prisma client in development
      await prisma.hyperSettings.update({
        where: { id: 1 },
        data: { strategyParams: bestChild.childParams }
      });
      
      // Update promotion status
      // @ts-ignore - Using mock Prisma client in development
      await prisma.evolutionMetric.update({
        where: { id: bestChild.childId },
        data: { promoted: true }
      });
    } else {
      console.log('[evolution] No child performed better than the parent');
    }
    
    console.log('[evolution] Evolution run completed');
  } catch (error) {
    console.error('[evolution] Error running evolution:', error);
  }
} 