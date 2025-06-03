import { prisma } from '../db.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('modelPromotion');

/**
 * Promotes a new ONNX model to be the active gatekeeper
 * This implements the "promotion" approach where we keep the old row and rename the new one
 * 
 * @param modelVersion Version ID of the model to promote (e.g., 'gatekeeper_20250602')
 * @returns Promise that resolves when the promotion is complete
 */
export async function promoteOnnxModel(modelVersion: string): Promise<boolean> {
  logger.info(`Attempting to promote model ${modelVersion} to gatekeeper_v1`);
  
  try {
    // Find the model to promote
    const modelToPromote = await prisma.rLModel.findFirst({
      where: { version: modelVersion }
    });
    
    if (!modelToPromote) {
      logger.error(`Model ${modelVersion} not found in database`);
      return false;
    }
    
    // Find the current active model
    const currentModel = await prisma.rLModel.findFirst({
      where: { version: 'gatekeeper_v1' }
    });
    
    // If there is a current active model, rename it to keep history
    if (currentModel) {
      const oldVersionName = `gatekeeper_old_${Date.now()}`;
      logger.info(`Demoting current model to ${oldVersionName}`);
      
      await prisma.rLModel.update({
        where: { id: currentModel.id },
        data: { version: oldVersionName }
      });
    }
    
    // Promote the new model
    await prisma.rLModel.update({
      where: { id: modelToPromote.id },
      data: { version: 'gatekeeper_v1' }
    });
    
    logger.info(`Successfully promoted model ${modelVersion} to gatekeeper_v1`);
    return true;
  } catch (error) {
    logger.error('Error promoting ONNX model:', { error });
    return false;
  }
}

/**
 * Inserts a new ONNX model into the database
 * @param path Path to the ONNX model file
 * @param note Description of the model
 * @returns Promise that resolves with the created model record
 */
export async function registerOnnxModel(path: string, note: string = 'New ONNX model'): Promise<any> {
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const version = `gatekeeper_${timestamp}`;
  
  logger.info(`Registering new ONNX model: ${path} as ${version}`);
  
  try {
    const model = await prisma.rLModel.create({
      data: {
        version,
        path,
        description: note,
        createdAt: new Date()
      }
    });
    
    logger.info(`Successfully registered model ${version}`);
    return model;
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
    where: { version: 'gatekeeper_v1' }
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