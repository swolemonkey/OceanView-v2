import { prisma } from '../db.js';
import { createLogger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

const logger = createLogger('modelPromotion');

// Constants
const PRIMARY_MODEL_PREFIX = 'gatekeeper_primary';
const MODEL_PREFIX = 'gatekeeper_';
const ML_DIR = 'ml';

/**
 * Promotes a new ONNX model to be the active gatekeeper
 * This implements the "promotion" approach where we keep the old row and rename the new one
 * 
 * @param modelId ID of the model to promote
 * @returns Promise that resolves when the promotion is complete
 */
export async function promoteOnnxModel(modelId: string | number): Promise<boolean> {
  const id = typeof modelId === 'string' ? parseInt(modelId, 10) : modelId;
  
  if (isNaN(id)) {
    logger.error(`Invalid model ID: ${modelId}`);
    return false;
  }
  
  logger.info(`Attempting to promote model ID ${id} to primary`);
  
  try {
    // Find the model to promote
    const modelToPromote = await prisma.rLModel.findUnique({
      where: { id }
    });
    
    if (!modelToPromote) {
      logger.error(`Model with ID ${id} not found in database`);
      return false;
    }
    
    // Find the current primary model
    const currentPrimary = await prisma.rLModel.findFirst({
      where: { version: { startsWith: PRIMARY_MODEL_PREFIX } }
    });
    
    // If there is a current primary model, rename it
    if (currentPrimary) {
      const oldVersionName = `${MODEL_PREFIX}${currentPrimary.id}`;
      logger.info(`Demoting current primary model (ID: ${currentPrimary.id}) to ${oldVersionName}`);
      
      await prisma.rLModel.update({
        where: { id: currentPrimary.id },
        data: { version: oldVersionName }
      });
    }
    
    // Promote the new model
    const newPrimaryVersion = `${PRIMARY_MODEL_PREFIX}${id}`;
    await prisma.rLModel.update({
      where: { id },
      data: { version: newPrimaryVersion }
    });
    
    logger.info(`Successfully promoted model ID ${id} to primary as ${newPrimaryVersion}`);
    return true;
  } catch (error) {
    logger.error('Error promoting ONNX model:', { error });
    return false;
  }
}

/**
 * Inserts a new ONNX model into the database
 * @param filepath Path to the ONNX model file (either full path or relative to ml directory)
 * @param note Description of the model
 * @returns Promise that resolves with the created model record
 */
export async function registerOnnxModel(filepath: string, note: string = 'New ONNX model'): Promise<any> {
  try {
    // Get just the filename if a path is provided
    const filename = path.basename(filepath);
    
    // Make sure path starts with ml/ for consistency
    const dbPath = filepath.startsWith(`${ML_DIR}/`) ? filepath : `${ML_DIR}/${filename}`;
    
    // Ensure the file exists
    const fullPath = path.resolve(process.cwd(), dbPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${fullPath}`);
    }
    
    // Create the model record
    const model = await prisma.rLModel.create({
      data: {
        version: '', // Temporary placeholder, will be updated after we know the ID
        path: dbPath,
        description: note,
        createdAt: new Date()
      }
    });
    
    // Update the version with the ID-based naming
    const versionName = `${MODEL_PREFIX}${model.id}`;
    
    await prisma.rLModel.update({
      where: { id: model.id },
      data: { version: versionName }
    });
    
    logger.info(`Successfully registered model as ${versionName} with path ${dbPath}`);
    
    // Return the updated model
    return await prisma.rLModel.findUnique({
      where: { id: model.id }
    });
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
    where: { version: { startsWith: PRIMARY_MODEL_PREFIX } }
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

/**
 * Updates file paths for existing models to ensure they match the actual files
 * @param options Configuration options
 * @returns Promise that resolves when the update is complete
 */
export async function updateModelFilePaths(options: { respectExistingPaths?: boolean } = {}): Promise<boolean> {
  // Default to respecting existing paths - only change if file doesn't exist
  const respectExistingPaths = options.respectExistingPaths !== false;
  
  try {
    const models = await listAllModels();
    
    for (const model of models) {
      // Check if file exists at current path
      const fullPath = path.resolve(process.cwd(), model.path);
      
      // If the file exists and we're respecting existing paths, skip this model
      if (respectExistingPaths && fs.existsSync(fullPath)) {
        continue;
      }
      
      // If file doesn't exist at the specified path, try to find it
      if (!fs.existsSync(fullPath)) {
        // Try to find the file with a different naming pattern
        const alternateNames = [
          `${ML_DIR}/gatekeeper_v1.onnx`,
          `${ML_DIR}/gatekeeper_v2.onnx`,
          `${ML_DIR}/gatekeeper_${model.id}.onnx`,
          `${ML_DIR}/gatekeeper_primary${model.id}.onnx`
        ];
        
        for (const altPath of alternateNames) {
          const altFullPath = path.resolve(process.cwd(), altPath);
          if (fs.existsSync(altFullPath)) {
            logger.info(`Updating path for model ${model.id} from ${model.path} to ${altPath}`);
            await prisma.rLModel.update({
              where: { id: model.id },
              data: { path: altPath }
            });
            break;
          }
        }
      }
    }
    
    return true;
  } catch (error) {
    logger.error('Error updating model file paths:', { error });
    return false;
  }
} 