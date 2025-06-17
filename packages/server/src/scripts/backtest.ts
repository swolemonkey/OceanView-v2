import { prisma } from '../db.js';

async function checkDatabaseConnection() {
  try {
    await prisma.$connect();
    console.log('Database connection successful');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

async function startDatabase() {
  try {
    console.log('Attempting to start TimescaleDB...');
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    // Check if we're in a Docker environment
    const { stdout: dockerCheck } = await execPromise('docker ps');
    if (dockerCheck.includes('timescaledb')) {
      console.log('TimescaleDB container found, attempting to start...');
      await execPromise('docker start timescaledb');
      // Wait for database to be ready
      await new Promise(resolve => setTimeout(resolve, 5000));
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error starting database:', error);
    return false;
  }
}

async function main() {
  // Check database connection first
  let isConnected = await checkDatabaseConnection();
  
  if (!isConnected) {
    console.log('Database not connected, attempting to start...');
    const started = await startDatabase();
    if (!started) {
      console.error('Failed to start database. Please ensure TimescaleDB is running.');
      process.exit(1);
    }
    
    // Try connecting again
    isConnected = await checkDatabaseConnection();
    if (!isConnected) {
      console.error('Still unable to connect to database after startup attempt.');
      process.exit(1);
    }
  }

  // Rest of the main function...
} 