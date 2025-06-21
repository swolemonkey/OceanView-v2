#!/usr/bin/env node

/**
 * 🗂️ POLYGON CACHE MANAGER
 * 
 * Dedicated script for managing Polygon data cache
 * - View cache statistics
 * - Clean old cache files
 * - Clear all cache
 * - Perform maintenance
 * 
 * Usage:
 *   npm run cache-stats
 *   npm run cache-clean [hours]
 *   npm run cache-clear
 *   npm run cache-maintenance
 */

import { PolygonDataFeed } from '../feeds/polygonDataFeed.js';

function printHeader(title: string): void {
  console.log('\n' + '='.repeat(60));
  console.log(`🗂️  ${title}`);
  console.log('='.repeat(60));
}

function printStats(): void {
  printHeader('POLYGON CACHE STATISTICS');
  
  const stats = PolygonDataFeed.getCacheStats();
  
  if (stats.totalFiles === 0) {
    console.log('📁 Cache is empty - no files found');
    return;
  }
  
  console.log(`📊 Total Files: ${stats.totalFiles}`);
  console.log(`💾 Total Size: ${stats.totalSizeMB} MB (${(stats.totalSize / 1024).toFixed(1)} KB)`);
  console.log(`📈 Average File Size: ${(stats.averageFileSize / 1024).toFixed(1)} KB`);
  console.log('');
  
  if (stats.oldestFile) {
    console.log(`⏰ Oldest File: ${stats.oldestFile}`);
    console.log(`   Age: ${stats.oldestAge} hours old`);
  }
  
  if (stats.newestFile) {
    console.log(`🆕 Newest File: ${stats.newestFile}`);
    console.log(`   Age: ${stats.newestAge} hours old`);
  }
  
  console.log('');
  
  // Provide recommendations
  if (stats.totalSizeMB > 100) {
    console.log('💡 RECOMMENDATION: Cache is large (>100MB). Consider running cleanup.');
  }
  
  if (stats.oldestAge > 72) {
    console.log('💡 RECOMMENDATION: Some files are very old (>72h). Consider running cleanup.');
  }
  
  if (stats.totalFiles > 50) {
    console.log('💡 RECOMMENDATION: Many cache files present. Regular maintenance recommended.');
  }
}

function cleanOldCache(maxAgeHours: number = 72): void {
  printHeader(`CLEANING OLD CACHE FILES (>${maxAgeHours}h)`);
  
  const result = PolygonDataFeed.clearOldCache(maxAgeHours);
  
  if (result.deletedCount === 0) {
    console.log('✅ No cleanup needed - all files are recent enough');
  } else {
    console.log(`🧹 Cleanup Summary:`);
    console.log(`   Files Deleted: ${result.deletedCount}`);
    console.log(`   Space Freed: ${result.freedMB.toFixed(2)} MB`);
  }
  
  if (result.errors.length > 0) {
    console.log(`⚠️  Errors encountered: ${result.errors.length}`);
    result.errors.forEach(error => console.log(`   - ${error}`));
  }
}

function clearAllCache(): void {
  printHeader('CLEARING ALL CACHE FILES');
  
  const result = PolygonDataFeed.clearAllCache();
  
  if (result.deletedCount === 0) {
    console.log('📁 Cache was already empty');
  } else {
    console.log(`🧹 Clear Summary:`);
    console.log(`   Files Deleted: ${result.deletedCount}`);
    console.log(`   Space Freed: ${result.freedMB.toFixed(2)} MB`);
  }
  
  if (result.errors.length > 0) {
    console.log(`⚠️  Errors encountered: ${result.errors.length}`);
    result.errors.forEach(error => console.log(`   - ${error}`));
  }
}

async function performMaintenance(): Promise<void> {
  printHeader('PERFORMING CACHE MAINTENANCE');
  
  await PolygonDataFeed.performMaintenance();
  
  console.log('');
  console.log('🔧 Maintenance completed. Updated statistics:');
  printStats();
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'stats';
  
  try {
    switch (command) {
      case 'stats':
      case '--stats':
      case '-s':
        printStats();
        break;
        
      case 'clean':
      case '--clean':
      case '-c':
        const maxAge = args[1] ? parseInt(args[1]) : 72;
        if (isNaN(maxAge) || maxAge <= 0) {
          console.error('❌ Invalid age parameter. Must be a positive number of hours.');
          process.exit(1);
        }
        cleanOldCache(maxAge);
        break;
        
      case 'clear':
      case '--clear':
      case '--clear-all':
        console.log('⚠️  WARNING: This will delete ALL cache files!');
        console.log('Press Ctrl+C within 3 seconds to cancel...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        clearAllCache();
        break;
        
      case 'maintenance':
      case '--maintenance':
      case '-m':
        await performMaintenance();
        break;
        
      case 'help':
      case '--help':
      case '-h':
        printHeader('CACHE MANAGER HELP');
        console.log('Available commands:');
        console.log('');
        console.log('  stats              Show cache statistics (default)');
        console.log('  clean [hours]      Clean files older than X hours (default: 72)');
        console.log('  clear              Clear ALL cache files (with warning)');
        console.log('  maintenance        Perform automatic maintenance');
        console.log('  help               Show this help message');
        console.log('');
        console.log('Examples:');
        console.log('  npm run cache-manager stats');
        console.log('  npm run cache-manager clean 48');
        console.log('  npm run cache-manager maintenance');
        break;
        
      default:
        console.error(`❌ Unknown command: ${command}`);
        console.error('Run "npm run cache-manager help" for available commands');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Cache manager error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Cache manager interrupted');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Cache manager terminated');
  process.exit(0);
});

// Run the CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
} 