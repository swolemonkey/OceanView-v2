import { prisma } from '../db.js';
import { createLogger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

const logger = createLogger('modelPromotion');

/**
 * Get the primary model identifier for a given model ID
 * @param id Model ID from the database
 * @returns The primary model identifier string
 */
function getPrimaryName(id: number): string {
  return `gatekeeper_primary${id}`;
}

/**
 * Get the standard model identifier for a given model ID
 * @param id Model ID from the database
 * @returns The standard model identifier string
 */
function getStandardName(id: number): string {
  return `gatekeeper_${id}`;
}

/**
 * Rename a physical ONNX model file to match its new version identifier
 * @param oldPath Original file path
 * @param newVersionName New version name to use in the file name
 * @returns Promise that resolves with the new file path
 */
async function renameModelFile(oldPath: string, newVersionName: string): Promise<string> {
  try {
    // Get the directory and extension
    const dir = path.dirname(oldPath);
    const ext = path.extname(oldPath);
    
    // Create the new file path
    const newPath = path.join(dir, `${newVersionName}${ext}`);
    
    // Skip if the paths are the same
    if (oldPath === newPath) {
      return oldPath;
    }
    
    // Check if old file exists
    if (!fs.existsSync(oldPath)) {
      logger.error(`File not found: ${oldPath}`);
      return oldPath; // Return old path without attempting rename
    }
    
    // Rename the file
    fs.copyFileSync(oldPath, newPath);
    logger.info(`Copied model file from ${oldPath} to ${newPath}`);
    
    return newPath;
  } catch (error) {
    logger.error('Error renaming model file:', { error, oldPath });
    return oldPath; // Return old path on error
  }
}

/**
 * Promotes a model to be the active gatekeeper
 * This updates the database and renames the model files to follow the new naming convention
 * 
 * @param modelId ID of the model to promote in the database
 * @returns Promise that resolves when the promotion is complete
 */
export async function promoteOnnxModel(modelId: number): Promise<boolean> {
  logger.info(`Attempting to promote model ID ${modelId} to primary status`);
  
  try {
    // Find the model to promote
    const modelToPromote = await prisma.rLModel.findUnique({
      where: { id: modelId }
    });
    
    if (!modelToPromote) {
      logger.error(`Model ID ${modelId} not found in database`);
      return false;
    }
    
    // Find the current primary model
    const currentModels = await prisma.rLModel.findMany({
      where: { 
        version: { 
          startsWith: 'gatekeeper_primary' 
        } 
      }
    });
    
    // Demote all current primary models (should only be one, but handle multiple for safety)
    for (const model of currentModels) {
      // Generate the new standard name for this model
      const newVersion = getStandardName(model.id);
      
      // Generate and use new file path
      const newPath = await renameModelFile(model.path, newVersion);
      
      // Update the database entry
      await prisma.rLModel.update({
        where: { id: model.id },
        data: { 
          version: newVersion,
          path: newPath
        }
      });
      
      logger.info(`Demoted primary model ${model.id} to ${newVersion}`);
    }
    
    // Generate the new primary name for the model to promote
    const newPrimaryVersion = getPrimaryName(modelId);
    
    // Generate and use new file path
    const newPrimaryPath = await renameModelFile(modelToPromote.path, newPrimaryVersion);
    
    // Promote the new model
    await prisma.rLModel.update({
      where: { id: modelId },
      data: { 
        version: newPrimaryVersion,
        path: newPrimaryPath
      }
    });
    
    logger.info(`Successfully promoted model ${modelId} to ${newPrimaryVersion}`);
    return true;
  } catch (error) {
    logger.error('Error promoting ONNX model:', { error });
    return false;
  }
}

/**
 * Inserts a new ONNX model into the database and renames the file to follow the convention
 * @param filePath Path to the ONNX model file
 * @param note Description of the model
 * @returns Promise that resolves with the created model record
 */
export async function registerOnnxModel(filePath: string, note: string = 'New ONNX model'): Promise<any> {
  logger.info(`Registering new ONNX model: ${filePath}`);
  
  try {
    // First create the database entry to get an ID
    const model = await prisma.rLModel.create({
      data: {
        // Use a temporary version that will be updated
        version: 'gatekeeper_temp',
        path: filePath,
        description: note,
        createdAt: new Date()
      }
    });
    
    // Now that we have an ID, generate the proper version and path
    const standardVersion = getStandardName(model.id);
    const standardPath = await renameModelFile(filePath, standardVersion);
    
    // Update the entry with the proper version and path
    const updatedModel = await prisma.rLModel.update({
      where: { id: model.id },
      data: {
        version: standardVersion,
        path: standardPath
      }
    });
    
    logger.info(`Successfully registered model ${standardVersion}`);
    return updatedModel;
  } catch (error) {
    logger.error('Error registering ONNX model:', { error });
    throw error;
  }
}

/**
 * Gets the currently active ONNX model
 * @returns Promise that resolves with the active model
 */
export async function getActiveModel(): Promise<any> {
  return prisma.rLModel.findFirst({
    where: { 
      version: { 
        startsWith: 'gatekeeper_primary' 
      } 
    }
  });
}

/**
 * Lists all ONNX models in the database
 * @returns Promise that resolves with an array of model records
 */
export async function listAllModels(): Promise<any[]> {
  return prisma.rLModel.findMany({
    orderBy: { createdAt: 'desc' }
  });
} 