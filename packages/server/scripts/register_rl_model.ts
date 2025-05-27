import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

// Initialize Prisma client
const prisma = new PrismaClient();

async function registerRLModel() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error('Usage: pnpm ts-node scripts/register_rl_model.ts <model_path> <model_version> <description>');
    process.exit(1);
  }

  const [modelPath, version, description] = args;
  
  // Check if model file exists
  const fullPath = path.resolve(process.cwd(), modelPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`Model file not found: ${fullPath}`);
    process.exit(1);
  }

  try {
    // Check if model already exists
    const existingModel = await prisma.rLModel.findUnique({
      where: { version },
    });

    if (existingModel) {
      console.log(`Model ${version} already exists with ID: ${existingModel.id}`);
      return;
    }

    // Create new model entry
    const model = await prisma.rLModel.create({
      data: {
        version,
        description,
        path: modelPath,
      },
    });

    console.log(`Successfully registered RL model:
    ID: ${model.id}
    Version: ${model.version}
    Path: ${model.path}
    Description: ${model.description || 'None'}`);
  } catch (error) {
    console.error('Error registering RL model:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

registerRLModel(); 