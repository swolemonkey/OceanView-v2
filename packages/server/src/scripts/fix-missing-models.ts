#!/usr/bin/env node
import { prisma } from '../db.js';
import fs from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('fix-models');

/**
 * Resolve a path to be absolute if it's not already
 * @param filePath Path to resolve
 * @returns Absolute path
 */
function resolveProjectPath(filePath: string): string {
  // If it's already an absolute path, return it
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  
  // Try relative to current directory
  const relativePath = path.resolve(process.cwd(), filePath);
  if (fs.existsSync(relativePath)) {
    return relativePath;
  }
  
  // Try relative to project root
  const projectRootPath = path.resolve(process.cwd(), '..', '..', filePath);
  if (fs.existsSync(projectRootPath)) {
    return projectRootPath;
  }
  
  // If we can't find it, return the original path
  return filePath;
}

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

    // Check each model and update its path to absolute if needed
    console.log('Updating model paths to absolute...');
    for (const model of models) {
      const absolutePath = resolveProjectPath(model.path);
      
      // If the path has changed, update it
      if (absolutePath !== model.path) {
        await prisma.rLModel.update({
          where: { id: model.id },
          data: { path: absolutePath }
        });
        console.log(`Updated model ${model.id} path: ${model.path} -> ${absolutePath}`);
      }
    }

    // Get updated models
    const updatedModels = await prisma.rLModel.findMany({
      orderBy: { id: 'asc' }
    });

    // Models with missing files
    const missingFiles = updatedModels.filter(model => !fs.existsSync(model.path));
    console.log(`Found ${missingFiles.length} models with missing files`);

    if (missingFiles.length === 0) {
      console.log('No missing files to fix!');
      return;
    }

    console.log('\nFixing missing files...');

    // Try to find a source file to copy from
    const sourceModel = updatedModels.find(model => 
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
        const dir = path.dirname(model.path);
        const expectedPath = path.join(dir, `${model.version}.onnx`);
        console.log(`Copying ${sourceModel.path} to ${expectedPath}`);
        
        // Make sure the directory exists
        fs.mkdirSync(path.dirname(expectedPath), { recursive: true });
        
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
    const finalModels = await prisma.rLModel.findMany({
      orderBy: { id: 'asc' }
    });
    
    finalModels.forEach(model => {
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