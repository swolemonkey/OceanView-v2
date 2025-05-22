const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Ensure bots directory exists
const botsDir = path.join(__dirname, 'dist/bots');
if (!fs.existsSync(botsDir)) {
  fs.mkdirSync(botsDir, { recursive: true });
}

// Compile TypeScript files
console.log('Compiling TypeScript files...');
try {
  execSync('tsc', { stdio: 'inherit' });
  console.log('TypeScript compilation complete.');
} catch (error) {
  console.error('Error compiling TypeScript:', error);
  process.exit(1);
} 