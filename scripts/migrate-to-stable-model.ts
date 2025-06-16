#!/usr/bin/env ts-node
/**
 * Migration script to transition from old ID-based model naming to stable active model approach
 * 
 * This script:
 * 1. Finds the current primary model (if any)
 * 2. Copies it to the stable active model path
 * 3. Updates the database to use the new naming convention
 * 4. Cleans up old files
 */

import { prisma } from '../packages/server/src/db.js';
import { initializeActiveModel, getActiveModel } from '../packages/server/src/rl/modelPromotion.js';
import fs from 'fs';
import path from 'path';

const logger = {
  info: (msg: string) => console.log(`ℹ️  ${msg}`),
  warn: (msg: string) => console.log(`⚠️  ${msg}`),
  error: (msg: string) => console.log(`❌ ${msg}`),
  success: (msg: string) => console.log(`✅ ${msg}`)
};

function resolveProjectPath(relativePath: string): string {
  return path.resolve(process.cwd(), '..', '..', relativePath);
}

async function migrateToStableModel() {
  logger.info('Starting migration to stable active model approach...');
  
  try {
    // Check if we already have an active model
    const existingActiveModel = await getActiveModel();
    if (existingActiveModel) {
      logger.success('Active model already exists, migration not needed');
      logger.info(`Current active model: ${existingActiveModel.version}`);
      logger.info(`Path: ${existingActiveModel.path}`);
      return;
    }
    
    // Look for old primary models
    const oldPrimaryModels = await prisma.rLModel.findMany({
      where: {
        version: {
          startsWith: 'gatekeeper_primary'
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    let sourceModelPath: string | null = null;
    let sourceDescription = 'Migrated from old naming convention';
    
    if (oldPrimaryModels.length > 0) {
      // Use the most recent primary model
      const latestPrimary = oldPrimaryModels[0];
      sourceModelPath = resolveProjectPath(latestPrimary.path);
      sourceDescription = `Migrated from ${latestPrimary.version}`;
      logger.info(`Found old primary model: ${latestPrimary.version}`);
      
      if (!fs.existsSync(sourceModelPath)) {
        logger.warn(`Primary model file not found at ${sourceModelPath}`);
        sourceModelPath = null;
      }
    }
    
    // If no primary model, look for any existing model files
    if (!sourceModelPath) {
      const possiblePaths = [
        'ml/gatekeeper_primary8.onnx',
        'ml/gatekeeper_primary7.onnx',
        'ml/gatekeeper_v1.onnx',
        'ml/gatekeeper_v2.onnx'
      ];
      
      for (const possiblePath of possiblePaths) {
        const fullPath = resolveProjectPath(possiblePath);
        if (fs.existsSync(fullPath)) {
          sourceModelPath = fullPath;
          sourceDescription = `Migrated from ${possiblePath}`;
          logger.info(`Found existing model file: ${possiblePath}`);
          break;
        }
      }
    }
    
    if (!sourceModelPath) {
      logger.error('No existing model files found to migrate from');
      logger.info('You may need to train a new model first');
      return;
    }
    
    // Initialize the active model system
    logger.info('Initializing active model system...');
    await initializeActiveModel(sourceModelPath);
    
    // Update the database record with proper description
    const activeModel = await getActiveModel();
    if (activeModel) {
      await prisma.rLModel.update({
        where: { id: activeModel.id },
        data: { description: sourceDescription }
      });
    }
    
    logger.success('Migration completed successfully!');
    logger.info('Active model is now available at: ml/gatekeeper_active.onnx');
    
    // Clean up old primary models from database
    if (oldPrimaryModels.length > 0) {
      logger.info('Cleaning up old primary model records...');
      for (const oldModel of oldPrimaryModels) {
        // Rename to versioned format
        const timestamp = oldModel.createdAt.toISOString().slice(0, 19).replace(/[:-]/g, '');
        const newVersion = `gatekeeper_v${timestamp}`;
        
        await prisma.rLModel.update({
          where: { id: oldModel.id },
          data: { version: newVersion }
        });
        
        logger.info(`Renamed ${oldModel.version} to ${newVersion}`);
      }
    }
    
    logger.success('Migration completed! You can now restart the server.');
    
  } catch (error) {
    logger.error(`Migration failed: ${error}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateToStableModel(); 