#!/usr/bin/env node
import { Command } from 'commander';
import 'dotenv/config';
import { promoteOnnxModel, registerOnnxModel, getActiveModel, listAllModels } from '../rl/modelPromotion.js';
import { prisma } from '../db.js';

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
  version: string;
}

// Command to register a new ONNX model
program
  .command('register')
  .description('Register a new ONNX model in the database')
  .requiredOption('-p, --path <path>', 'Path to the ONNX model file')
  .option('-n, --note <note>', 'Description of the model', 'Manual registration')
  .action(async (options: RegisterOptions) => {
    try {
      const model = await registerOnnxModel(options.path, options.note);
      console.log(`Successfully registered model ${model.version} with ID ${model.id}`);
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
  .requiredOption('-v, --version <version>', 'Version ID of the model to promote (e.g., gatekeeper_20250602)')
  .action(async (options: PromoteOptions) => {
    try {
      const result = await promoteOnnxModel(options.version);
      if (result) {
        console.log(`Successfully promoted model ${options.version} to gatekeeper_v1`);
      } else {
        console.error(`Failed to promote model ${options.version}`);
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
        console.log(`${model.id} | ${model.version} | ${model.path} | ${model.createdAt.toISOString()} | ${model.description || ''}`);
      });
      
      // Get and mark the active model
      const activeModel = await getActiveModel();
      if (activeModel) {
        console.log('\nActive model:');
        console.log(`${activeModel.id} | ${activeModel.version} | ${activeModel.path} | ${activeModel.createdAt.toISOString()} | ${activeModel.description || ''}`);
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

// Parse command line arguments
program.parse(process.argv);

// If no arguments, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
} 