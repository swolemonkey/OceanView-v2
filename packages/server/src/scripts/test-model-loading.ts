#!/usr/bin/env node
import 'dotenv/config';
import { getActiveModel } from '../rl/modelPromotion.js';
import { RLGatekeeper } from '../rl/gatekeeper.js';
import fs from 'fs';
import path from 'path';

/**
 * This script tests model loading to verify it works correctly
 */
async function testModelLoading() {
  try {
    console.log('========== Testing ONNX Model Loading ==========');
    
    // Get the active model
    console.log('Getting active model from database...');
    const activeModel = await getActiveModel();
    
    if (!activeModel) {
      console.error('No active model found in database.');
      return;
    }
    
    console.log(`Found active model: ${activeModel.version}`);
    console.log(`Path: ${activeModel.path}`);
    
    // Check if the file exists
    if (fs.existsSync(activeModel.path)) {
      console.log(`File exists at path: ${activeModel.path}`);
      console.log(`File size: ${fs.statSync(activeModel.path).size} bytes`);
    } else {
      console.error(`File does not exist at path: ${activeModel.path}`);
      // Try to find the file in other locations
      const relativeToWorkspace = path.resolve(process.cwd(), '../../', activeModel.path.replace(/^.*[\\\/]/, ''));
      if (fs.existsSync(relativeToWorkspace)) {
        console.log(`File found at alternate path: ${relativeToWorkspace}`);
      } else {
        console.error('Could not find model file in alternative locations.');
      }
    }
    
    // Try loading the model
    console.log('\nAttempting to load the model...');
    const gatekeeper = new RLGatekeeper(1);
    await gatekeeper.init(activeModel.path);
    
    // Test a simple prediction
    console.log('\nTesting a sample prediction...');
    const testFeatures = {
      symbol: 'BTC',
      price: 50000,
      rsi: 50,
      adx: 25,
      volatility: 0.02,
      recentTrend: 0.01,
      dayOfWeek: 3,
      hourOfDay: 14,
      rsi14: 60,
      adx14: 30,
      fastMASlowDelta: 0.005,
      bbWidth: 0.03,
      avgSent: 0.7,
      avgOB: 1.5
    };
    
    const { score, id } = await gatekeeper.scoreIdea(testFeatures, 'buy');
    console.log(`Sample prediction score: ${score} (ID: ${id})`);
    
    console.log('\n========== Test Complete ==========');
    
    // If we get here, the model loaded successfully
    console.log('\nSuccess! The model loaded correctly.');
    console.log('Model path resolution and loading are working as expected.');
    
  } catch (error) {
    console.error('Error testing model loading:', error);
  }
}

// Run the test
testModelLoading();
