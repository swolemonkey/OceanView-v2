import { prisma } from '../db.js';
import fs from 'fs';
import path from 'path';

async function fixModelPaths() {
  try {
    // Make sure we're pointing to the correct model file
    // Since gatekeeper_v2.onnx exists, we want to make sure the primary model uses it
    
    // Update the primary model path to use v2
    await prisma.rLModel.update({
      where: { id: 6 },
      data: { path: 'ml/gatekeeper_v2.onnx' }
    });
    
    console.log('Updated primary model (ID 6) path to ml/gatekeeper_v2.onnx');
    
    // Create a script that will run the server with the correct path
    const scriptContent = `#!/bin/bash
# This script starts the server with a flag to use the v2 model
export USE_V2_MODEL=true
cd packages/server && pnpm run dev
`;

    fs.writeFileSync('start-with-v2.sh', scriptContent, { mode: 0o755 });
    console.log('Created start-with-v2.sh script');
    
    console.log('Paths updated successfully');
    console.log('\nVerifying active model...');
    
    // Check the current active model
    const activeModel = await prisma.rLModel.findFirst({
      where: { version: { startsWith: 'gatekeeper_primary' } }
    });
    
    if (activeModel) {
      console.log(`Active model: ID ${activeModel.id}, version ${activeModel.version}`);
      console.log(`Path: ${activeModel.path}`);
      
      // Verify the file exists
      if (fs.existsSync(activeModel.path)) {
        console.log(`File exists: ${activeModel.path}`);
      } else {
        console.error(`ERROR: File does not exist: ${activeModel.path}`);
      }
    } else {
      console.log('No active model found');
    }
    
    console.log('\nTo start the server with the v2 model:');
    console.log('./start-with-v2.sh');
    
  } catch (error) {
    console.error('Error fixing paths:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixModelPaths(); 