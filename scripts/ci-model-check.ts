import { PrismaClient } from '@prisma/client';

/**
 * CI check to ensure all required Prisma models exist
 * This script verifies that crucial models are present in the schema
 */
async function checkModels() {
  console.log('CI: Verifying Prisma models...');
  
  try {
    const prisma = new PrismaClient();
    
    // List of required models to check
    const requiredModels = [
      'accountState',
      'bot',
      'order',
      'trade',
      'strategyVersion',
      'rlModel'
    ];
    
    // Check each model by attempting to access it
    for (const model of requiredModels) {
      try {
        // Cast to any to allow dynamic property access
        const modelExists = !!(prisma as any)[model];
        if (!modelExists) {
          console.error(`❌ Required model missing: ${model}`);
          process.exit(1);
        }
      } catch (err) {
        console.error(`❌ Error checking model ${model}:`, err);
        process.exit(1);
      }
    }
    
    console.log('✅ All required Prisma models present');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to initialize Prisma client:', error);
    process.exit(1);
  }
}

checkModels().catch(e => {
  console.error('❌ Unhandled error:', e);
  process.exit(1);
}); 