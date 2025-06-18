#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to recursively find all TypeScript files
function findTsFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
      findTsFiles(fullPath, files);
    } else if (item.endsWith('.ts') && !item.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// Function to fix imports in a file
function fixImportsInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Regex to match relative imports without .js extension
  const importRegex = /from\s+['"](\.[^'"]*?)['"];?/g;
  const importStaticRegex = /import\s+['"](\.[^'"]*?)['"];?/g;
  
  let newContent = content;
  
  // Fix 'from' imports
  newContent = newContent.replace(importRegex, (match, importPath) => {
    if (!importPath.endsWith('.js') && !importPath.endsWith('.json')) {
      modified = true;
      return match.replace(importPath, importPath + '.js');
    }
    return match;
  });
  
  // Fix static imports
  newContent = newContent.replace(importStaticRegex, (match, importPath) => {
    if (!importPath.endsWith('.js') && !importPath.endsWith('.json')) {
      modified = true;
      return match.replace(importPath, importPath + '.js');
    }
    return match;
  });
  
  if (modified) {
    fs.writeFileSync(filePath, newContent);
    console.log(`Fixed imports in: ${path.relative(process.cwd(), filePath)}`);
    return true;
  }
  
  return false;
}

// Main execution
const srcDir = path.join(__dirname, 'packages', 'server', 'src');
console.log(`Scanning for TypeScript files in: ${srcDir}`);

const tsFiles = findTsFiles(srcDir);
console.log(`Found ${tsFiles.length} TypeScript files`);

let fixedCount = 0;
for (const file of tsFiles) {
  if (fixImportsInFile(file)) {
    fixedCount++;
  }
}

console.log(`\n✅ Fixed imports in ${fixedCount} files`); 