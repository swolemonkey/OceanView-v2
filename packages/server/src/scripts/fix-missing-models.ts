#!/usr/bin/env node
import { prisma } from '../db.js';
import fs from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('fix-models');

/**
 * This script fixes issues with missing model files.
 * It either creates copies of existing files for missing ones or removes entries.
 */
async function fixMissingModels() {
  try {
    // Get all models from the database
    const models = await prisma.rLModel.findMany({
      orderBy: { id: 'asc' }
    });
    console.log(`Found ${models.length} model records in database`);

    // Models with missing files
    const missingFiles = models.filter(model => !fs.existsSync(model.path));
    console.log(`Found ${missingFiles.length} models with missing files`);

    if (missingFiles.length === 0) {
      console.log('No missing files to fix!');
      return;
    }

    console.log('\nFixing missing files...');

    // Try to find a source file to copy from
    const sourceModel = models.find(model => 
      fs.existsSync(model.path) && 
      !model.version.startsWith('gatekeeper_primary')
    );

    if (!sourceModel) {
      console.log('No valid source model found to copy from');
      console.log('Will remove models with missing files from the database');
      
      for (const model of missingFiles) {
        console.log(`Removing model ${model.id} (${model.version}): ${model.path}`);
        await prisma.rLModel.delete({
          where: { id: model.id }
        });
      }
    } else {
      console.log(`Using model ${sourceModel.id} (${sourceModel.path}) as source`);
      
      for (const model of missingFiles) {
        // Create the expected path
        const expectedPath = `ml/${model.version}.onnx`;
        console.log(`Copying ${sourceModel.path} to ${expectedPath}`);
        
        // Copy the file
        fs.copyFileSync(sourceModel.path, expectedPath);
        
        // Update the database
        await prisma.rLModel.update({
          where: { id: model.id },
          data: { path: expectedPath }
        });
        
        console.log(`Fixed model ${model.id}`);
      }
    }
    
    console.log('\nFix complete. Final model listing:');
    const updatedModels = await prisma.rLModel.findMany({
      orderBy: { id: 'asc' }
    });
    
    updatedModels.forEach(model => {
      const fileExists = fs.existsSync(model.path) ? 'File exists' : 'File missing';
      console.log(`${model.id} | ${model.version} | ${model.path} | ${fileExists}`);
    });
  } catch (error) {
    console.error('Error fixing missing models:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the fix
fixMissingModels(); 