import { PrismaClient } from '@prisma/client';
import { exit } from 'node:process';

const prisma = new PrismaClient();

async function seedBots() {
  // Delete existing bots if any
  await prisma.bot.deleteMany({});
  
  // Create bots with types - using @ts-ignore to bypass type checking
  await prisma.bot.create({ 
    // @ts-ignore - type field added to schema but not yet recognized by TypeScript
    data: { name: 'scalper', enabled: true, type: 'scalper' }
  });
  
  await prisma.bot.create({ 
    // @ts-ignore - type field added to schema but not yet recognized by TypeScript
    data: { name: 'hypertrades', enabled: true, type: 'hypertrades' }
  });
  
  console.log('Bots inserted');
  await prisma.$disconnect();
  exit(0);
}

seedBots().catch(async (error) => {
  console.error('Error seeding bots:', error);
  await prisma.$disconnect();
  exit(1);
}); 