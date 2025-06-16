import { prisma } from '../db';
import { createLogger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

const logger = createLogger('modelPromotion');

// Stable paths for the active model
const ACTIVE_MODEL_PATH = 'ml/gatekeeper_active.onnx';
const ACTIVE_MODEL_BACKUP_PATH = 'ml/gatekeeper_active_backup.onnx';
const ACTIVE_VERSION_NAME = 'gatekeeper_active';

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
  
  // Try to resolve from project root
  return path.resolve(process.cwd(), '..', '..', filePath);
}

/**
 * Generate a versioned model name based on timestamp
 * @param timestamp Optional timestamp, defaults to current time
 * @returns Versioned model name
 */
function getVersionedName(timestamp?: string): string {
  const ts = timestamp || new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
  return `gatekeeper_v${ts}`;
}

/**
 * Copy the active model to create a backup before promotion
 * @returns Promise that resolves with the backup path or null if no active model exists
 */
async function backupActiveModel(): Promise<string | null> {
  const activeModelPath = resolveProjectPath(ACTIVE_MODEL_PATH);
  const backupPath = resolveProjectPath(ACTIVE_MODEL_BACKUP_PATH);
  
  if (fs.existsSync(activeModelPath)) {
    try {
      fs.copyFileSync(activeModelPath, backupPath);
      logger.info(`Backed up active model to ${backupPath}`);
      return backupPath;
    } catch (error) {
      logger.error('Error backing up active model:', { error });
      return null;
    }
  }
  
  return null;
}

/**
 * Promotes a model to be the active gatekeeper by copying it to the stable active path
 * 
 * @param modelId ID of the model to promote in the database
 * @returns Promise that resolves when the promotion is complete
 */
export async function promoteOnnxModel(modelId: number): Promise<boolean> {
  logger.info(`Attempting to promote model ID ${modelId} to active status`);
  
  try {
    // Find the model to promote
    const modelToPromote = await prisma.rLModel.findUnique({
      where: { id: modelId }
    });
    
    if (!modelToPromote) {
      logger.error(`Model ID ${modelId} not found in database`);
      return false;
    }
    
    // Check if the model file exists
    const sourceModelPath = resolveProjectPath(modelToPromote.path);
    if (!fs.existsSync(sourceModelPath)) {
      logger.error(`Model file not found: ${sourceModelPath}`);
      return false;
    }
    
    // Backup the current active model if it exists
    await backupActiveModel();
    
    // Find the current active model and rename it to a versioned name
    const currentActiveModel = await prisma.rLModel.findFirst({
      where: { version: ACTIVE_VERSION_NAME }
    });
    
    if (currentActiveModel) {
      // Generate a versioned name for the old active model
      const oldVersionName = getVersionedName();
      await prisma.rLModel.update({
        where: { id: currentActiveModel.id },
        data: { version: oldVersionName }
      });
      logger.info(`Renamed previous active model to ${oldVersionName}`);
    }
    
    // Copy the new model to the active path
    const activeModelPath = resolveProjectPath(ACTIVE_MODEL_PATH);
    fs.copyFileSync(sourceModelPath, activeModelPath);
    logger.info(`Copied model from ${sourceModelPath} to ${activeModelPath}`);
    
    // Update the promoted model to have the active version name and stable path
    await prisma.rLModel.update({
      where: { id: modelId },
      data: { 
        version: ACTIVE_VERSION_NAME,
        path: ACTIVE_MODEL_PATH
      }
    });
    
    logger.info(`Successfully promoted model ${modelId} to active status`);
    return true;
  } catch (error) {
    logger.error('Error promoting ONNX model:', { error });
    return false;
  }
}

/**
 * Registers a new ONNX model in the database with versioned naming
 * @param filePath Path to the ONNX model file
 * @param note Description of the model
 * @returns Promise that resolves with the created model record
 */
export async function registerOnnxModel(filePath: string, note: string = 'New ONNX model'): Promise<any> {
  // Resolve to absolute path
  const absoluteFilePath = resolveProjectPath(filePath);
  logger.info(`Registering new ONNX model: ${absoluteFilePath}`);
  
  try {
    // Check if file exists
    if (!fs.existsSync(absoluteFilePath)) {
      throw new Error(`Model file ${absoluteFilePath} not found`);
    }
    
    // Generate a versioned name for this model
    const versionedName = getVersionedName();
    const versionedPath = path.join(path.dirname(absoluteFilePath), `${versionedName}.onnx`);
    
    // Copy the file to the versioned path (keep original for reference)
    if (absoluteFilePath !== versionedPath) {
      fs.copyFileSync(absoluteFilePath, versionedPath);
      logger.info(`Created versioned copy at ${versionedPath}`);
    }
    
    // Create the database entry
    const model = await prisma.rLModel.create({
      data: {
        version: versionedName,
        path: versionedPath,
        description: note,
        createdAt: new Date()
      }
    });
    
    logger.info(`Successfully registered model ${versionedName}`);
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
    where: { version: ACTIVE_VERSION_NAME }
  });
}

/**
 * Gets the path to the active model file (stable path)
 * @returns The stable path to the active model
 */
export function getActiveModelPath(): string {
  return ACTIVE_MODEL_PATH;
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
 * Initialize the active model system by ensuring the stable active model exists
 * @param defaultModelPath Path to use as the initial active model if none exists
 * @returns Promise that resolves when initialization is complete
 */
export async function initializeActiveModel(defaultModelPath: string): Promise<void> {
  const activeModelPath = resolveProjectPath(ACTIVE_MODEL_PATH);
  
  // If active model file doesn't exist, create it from the default
  if (!fs.existsSync(activeModelPath)) {
    const defaultPath = resolveProjectPath(defaultModelPath);
    if (fs.existsSync(defaultPath)) {
      fs.copyFileSync(defaultPath, activeModelPath);
      logger.info(`Initialized active model from ${defaultPath}`);
    } else {
      throw new Error(`Default model file not found: ${defaultPath}`);
    }
  }
  
  // Ensure there's an active model record in the database
  const activeModel = await getActiveModel();
  if (!activeModel) {
    // Create an active model record pointing to the stable path
    await prisma.rLModel.create({
      data: {
        version: ACTIVE_VERSION_NAME,
        path: ACTIVE_MODEL_PATH,
        description: 'Active gatekeeper model',
        createdAt: new Date()
      }
    });
    logger.info(`Created active model record in database`);
  }
} 