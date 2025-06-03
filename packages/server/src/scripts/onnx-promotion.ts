#!/usr/bin/env node
import { Command } from 'commander';
import 'dotenv/config';
import { promoteOnnxModel, registerOnnxModel, getActiveModel, listAllModels } from '../rl/modelPromotion.js';
import { prisma } from '../db.js';
import path from 'path';
import fs from 'fs';

// Helper function to resolve paths
function resolveProjectPath(filePath: string): string {
  // If it's already an absolute path, return it
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  
  // Try to resolve from project root
  return path.resolve(process.cwd(), '..', '..', filePath);
}

// Create a new command program
const program = new Command();

program
  .name('onnx-promotion')
  .description('CLI tool for managing ONNX model promotion')
  .version('1.0.0');

interface RegisterOptions {
  path: string;
  note: string;
}

interface PromoteOptions {
  id: string;
}

// Command to register a new ONNX model
program
  .command('register')
  .description('Register a new ONNX model in the database')
  .requiredOption('-p, --path <path>', 'Path to the ONNX model file')
  .option('-n, --note <note>', 'Description of the model', 'Manual registration')
  .action(async (options: RegisterOptions) => {
    try {
      // Resolve the path to absolute
      const absolutePath = resolveProjectPath(options.path);
      
      // Check if file exists
      if (!fs.existsSync(absolutePath)) {
        console.error(`Error: Model file not found at ${absolutePath}`);
        process.exit(1);
      }
      
      const model = await registerOnnxModel(absolutePath, options.note);
      console.log(`Successfully registered model with ID ${model.id}`);
      console.log(`Version: ${model.version}`);
      console.log(`Path: ${model.path}`);
      await prisma.$disconnect();
    } catch (error) {
      console.error('Error registering model:', error);
      process.exit(1);
    }
  });

// Command to promote an existing model to be the active one
program
  .command('promote')
  .description('Promote an existing ONNX model to be the active one')
  .requiredOption('-i, --id <id>', 'ID of the model to promote')
  .action(async (options: PromoteOptions) => {
    try {
      const modelId = parseInt(options.id, 10);
      if (isNaN(modelId)) {
        console.error('Invalid model ID. Please provide a valid number.');
        process.exit(1);
      }
      
      const result = await promoteOnnxModel(modelId);
      if (result) {
        console.log(`Successfully promoted model with ID ${modelId} to primary status`);
      } else {
        console.error(`Failed to promote model with ID ${modelId}`);
        process.exit(1);
      }
      await prisma.$disconnect();
    } catch (error) {
      console.error('Error promoting model:', error);
      process.exit(1);
    }
  });

// Command to list all models
program
  .command('list')
  .description('List all ONNX models in the database')
  .action(async () => {
    try {
      const models = await listAllModels();
      console.log('ONNX Models:');
      console.log('---------------------------------------------');
      console.log('ID | Version | Path | Created At | Description');
      console.log('---------------------------------------------');
      models.forEach(model => {
        const isPrimary = model.version.startsWith('gatekeeper_primary') ? '* ' : '  ';
        // Check if file exists
        const fileExists = fs.existsSync(resolveProjectPath(model.path)) ? '✓' : '✗';
        console.log(`${isPrimary}${model.id} | ${model.version} | ${model.path} ${fileExists} | ${model.createdAt.toISOString()} | ${model.description || ''}`);
      });
      
      // Get and mark the active model
      const activeModel = await getActiveModel();
      if (activeModel) {
        console.log('\nActive (primary) model:');
        console.log(`ID: ${activeModel.id}`);
        console.log(`Version: ${activeModel.version}`);
        console.log(`Path: ${activeModel.path}`);
        const fileExists = fs.existsSync(resolveProjectPath(activeModel.path)) ? 'File exists' : 'File missing';
        console.log(`Status: ${fileExists}`);
        console.log(`Created At: ${activeModel.createdAt.toISOString()}`);
        console.log(`Description: ${activeModel.description || ''}`);
      } else {
        console.log('\nNo active model found');
      }
      
      await prisma.$disconnect();
    } catch (error) {
      console.error('Error listing models:', error);
      process.exit(1);
    }
  });

// Command to get the current active model
program
  .command('active')
  .description('Get the currently active ONNX model')
  .action(async () => {
    try {
      const activeModel = await getActiveModel();
      if (activeModel) {
        console.log('Active model:');
        console.log(`ID: ${activeModel.id}`);
        console.log(`Version: ${activeModel.version}`);
        console.log(`Path: ${activeModel.path}`);
        const fileExists = fs.existsSync(resolveProjectPath(activeModel.path)) ? 'File exists' : 'File missing';
        console.log(`Status: ${fileExists}`);
        console.log(`Created At: ${activeModel.createdAt.toISOString()}`);
        console.log(`Description: ${activeModel.description || ''}`);
      } else {
        console.log('No active model found');
      }
      await prisma.$disconnect();
    } catch (error) {
      console.error('Error getting active model:', error);
      process.exit(1);
    }
  });

// Command to rename all existing models to follow the new convention
program
  .command('migrate-naming')
  .description('Migrate all existing models to the new naming convention')
  .action(async () => {
    try {
      const models = await listAllModels();
      console.log('Starting migration of model naming convention...');
      
      for (const model of models) {
        // Skip models that already follow the convention
        if (model.version.startsWith('gatekeeper_primary') || 
            model.version === `gatekeeper_${model.id}`) {
          console.log(`Model ${model.id} already follows the naming convention: ${model.version}`);
          continue;
        }
        
        // Determine if this is the primary model
        const isPrimary = model.version === 'gatekeeper_v1';
        const newVersion = isPrimary ? `gatekeeper_primary${model.id}` : `gatekeeper_${model.id}`;
        
        // Get directory and extension for the path
        const absolutePath = resolveProjectPath(model.path);
        const pathParts = absolutePath.split('/');
        const filename = pathParts.pop();
        const dir = pathParts.join('/');
        const ext = filename?.includes('.') ? filename.substring(filename.lastIndexOf('.')) : '';
        
        // Create the new path
        const newPath = `${dir}/${newVersion}${ext}`;
        
        console.log(`Migrating model ${model.id}:`);
        console.log(`  From: ${model.version} (${model.path})`);
        console.log(`  To:   ${newVersion} (${newPath})`);
        
        try {
          // Rename the file if it exists
          if (fs.existsSync(absolutePath)) {
            fs.copyFileSync(absolutePath, newPath);
            console.log(`  File copied from ${absolutePath} to ${newPath}`);
          } else {
            console.log(`  Warning: Source file ${absolutePath} not found, only updating database`);
          }
        } catch (fileError) {
          console.error(`  Error copying file: ${fileError}`);
        }
        
        // Update the database entry
        await prisma.rLModel.update({
          where: { id: model.id },
          data: {
            version: newVersion,
            path: newPath
          }
        });
        
        console.log(`  Database updated for model ${model.id}`);
      }
      
      console.log('\nMigration complete. New model listing:');
      const updatedModels = await listAllModels();
      updatedModels.forEach(model => {
        const fileExists = fs.existsSync(resolveProjectPath(model.path)) ? '✓' : '✗';
        console.log(`${model.id} | ${model.version} | ${model.path} ${fileExists}`);
      });
      
      await prisma.$disconnect();
    } catch (error) {
      console.error('Error during migration:', error);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse(process.argv);

// If no arguments, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
} 