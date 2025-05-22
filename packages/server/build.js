import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Clean up any JS files in the source directory
console.log('Removing any existing JS files from src directory...');
try {
  execSync('rm -rf src/**/*.js', { stdio: 'inherit' });
  console.log('Existing JS files removed.');
} catch (error) {
  console.warn('Warning: Could not clean JS files:', error.message);
}

// Compile TypeScript files
console.log('Compiling TypeScript files...');
try {
  execSync('tsc', { stdio: 'inherit' });
  console.log('TypeScript compilation complete.');
} catch (error) {
  console.error('Error compiling TypeScript:', error.message);
  process.exit(1);
}

console.log('Build process completed successfully.'); 