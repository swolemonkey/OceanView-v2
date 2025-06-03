#!/usr/bin/env node
import { prisma } from '../db.js';
import fs from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('onnx-cleanup');

/**
 * This script cleans up the ONNX model records in the database.
 * It ensures all paths are correct and removes references to non-existent files.
 */
async function cleanupDatabase() {
  try {
    // Get all models from the database
    const models = await prisma.rLModel.findMany();
    console.log(`Found ${models.length} model records in database`);

    // Check each model record
    for (const model of models) {
      console.log(`Checking model ${model.id} (${model.version}): ${model.path}`);
      
      // Check if the file exists
      if (!fs.existsSync(model.path)) {
        console.log(`  File not found: ${model.path}`);
        
        // Determine the expected path based on the version
        let expectedPath;
        if (model.version.startsWith('gatekeeper_primary')) {
          expectedPath = `ml/${model.version}.onnx`;
        } else {
          expectedPath = `ml/${model.version}.onnx`;
        }
        
        // Check if the expected path exists
        if (fs.existsSync(expectedPath)) {
          console.log(`  Updating path to: ${expectedPath}`);
          await prisma.rLModel.update({
            where: { id: model.id },
            data: { path: expectedPath }
          });
        } else {
          console.log(`  Warning: Expected file ${expectedPath} also not found`);
          // Don't update if we can't find a valid file
        }
      } else {
        console.log(`  File exists: ${model.path}`);
      }
    }
    
    // Get the active model
    const activeModel = await prisma.rLModel.findFirst({
      where: { 
        version: { 
          startsWith: 'gatekeeper_primary' 
        } 
      }
    });
    
    if (activeModel) {
      console.log(`\nActive model: ${activeModel.id} (${activeModel.version}): ${activeModel.path}`);
      if (!fs.existsSync(activeModel.path)) {
        console.log(`  Warning: Active model file not found: ${activeModel.path}`);
      }
    } else {
      console.log(`\nNo active model found`);
    }
    
    console.log('\nDatabase cleanup complete');
  } catch (error) {
    console.error('Error during database cleanup:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
cleanupDatabase(); 