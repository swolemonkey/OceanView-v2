import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import { prisma } from '../db.js';

/**
 * Executes a shell command and returns the output
 * @param command Command to execute
 * @returns Promise that resolves with stdout or rejects with error
 */
async function executeCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args);
    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });
  });
}

/**
 * Retrains the gatekeeper model using latest data
 * @returns Promise that resolves when retraining is complete
 */
export async function retrainGatekeeper(): Promise<void> {
  try {
    console.log('Starting gatekeeper retraining...');
    
    // Step 1: Export latest dataset
    console.log('Exporting RL dataset...');
    await executeCommand('pnpm', ['ts-node', 'scripts/export_rl_dataset.ts']);
    
    // Step 2: Train new model with unique temp filename
    const tempFilename = `tmp_${randomUUID()}.onnx`;
    const tempPath = path.join('ml', tempFilename);
    console.log(`Training model to ${tempPath}...`);
    
    try {
      await executeCommand('python3', ['ml/train_gatekeeper.py', '--output', tempPath]);
    } catch (error) {
      console.error('Error during model training, using simplified script:', error);
      // Fallback to simplified script if main training fails
      await executeCommand('python3', ['ml/train_gatekeeper_simple.py', '--output', tempPath]);
    }
    
    // Step 3: Register the new model
    console.log('Registering new model...');
    const modelVersion = `gatekeeper_v${new Date().toISOString().split('T')[0].replace(/-/g, '')}`;
    await executeCommand('pnpm', [
      'ts-node', 
      'scripts/register_rl_model.ts', 
      tempPath, 
      modelVersion, 
      `Auto-trained model ${new Date().toLocaleString()}`
    ]);
    
    console.log('Gatekeeper retraining completed successfully');
    return;
  } catch (error) {
    console.error('Error during gatekeeper retraining:', error);
    throw error;
  }
} 