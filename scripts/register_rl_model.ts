import { prisma } from '../packages/server/src/db.js';

async function main() {
  try {
    const model = await prisma.rLModel.create({
      data: {
        version: 'gatekeeper_v1',
        path: './ml/gatekeeper_v1.onnx',
        description: 'Logistic regression baseline, AUC ~0.63'
      }
    });
    
    console.log('Registered RL model:', model);
    
    // Initialize account state if it doesn't exist
    const accountState = await prisma.accountState.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        equity: 10000
      }
    });
    
    console.log('Account state initialized:', accountState);
    
  } catch (error) {
    console.error('Error registering model:', error);
  }
}

main(); 