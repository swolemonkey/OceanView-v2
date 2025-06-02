import { prisma } from './src/db.js';

async function main() {
  console.log('Available Prisma models:', Object.keys(prisma));
  
  // Check if the specific tables we need exist in the database
  try {
    const heartbeatExists = await (prisma as any).$queryRaw`SELECT name FROM sqlite_master WHERE type='table' AND name='BotHeartbeat'`;
    console.log('BotHeartbeat table exists in DB:', heartbeatExists);
  } catch (error) {
    console.error('Error checking BotHeartbeat table:', error);
  }
  
  try {
    const portfolioMetricExists = await (prisma as any).$queryRaw`SELECT name FROM sqlite_master WHERE type='table' AND name='PortfolioMetric'`;
    console.log('PortfolioMetric table exists in DB:', portfolioMetricExists);
  } catch (error) {
    console.error('Error checking PortfolioMetric table:', error);
  }
  
  // Try to create a heartbeat entry using raw SQL
  try {
    const result = await (prisma as any).$executeRaw`INSERT INTO "BotHeartbeat" ("status", "details") VALUES ('test', 'Testing from script')`;
    console.log('Inserted heartbeat row with raw SQL:', result);
  } catch (error) {
    console.error('Error inserting heartbeat with raw SQL:', error);
  }
}

main()
  .catch(console.error)
  .finally(() => (prisma as any).$disconnect()); 