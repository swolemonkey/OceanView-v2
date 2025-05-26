import { prisma } from '../packages/server/src/db.js';

async function main() {
  // Get command line arguments
  const args = process.argv.slice(2);
  const modelPath = args[0] || './ml/gatekeeper_v1.onnx';
  const version = args[1] || 'gatekeeper_v1';
  const description = args[2] || 'Logistic regression baseline';
  
  try {
    const model = await prisma.rLModel.create({
      data: {
        version,
        path: modelPath,
        description
      }
    });
    
    console.log('Registered RL model:', model);
    
    // Initialize account state if it doesn't exist
    // First try to find the account state
    let accountState = await prisma.accountState.findFirst();
    
    if (!accountState) {
      // If it doesn't exist, create it
      // Use type assertion to handle TypeScript error
      const accountClient = prisma.accountState as any;
      accountState = await accountClient.create({
        data: {
          equity: 10000
        }
      });
      console.log('Account state created:', accountState);
    } else {
      console.log('Account state already exists:', accountState);
    }
    
  } catch (error) {
    console.error('Error registering model:', error);
  }
}

main(); 