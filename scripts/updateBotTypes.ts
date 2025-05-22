import { PrismaClient } from '@prisma/client';
import { exit } from 'node:process';

const prisma = new PrismaClient();

async function updateBotTypes() {
  // Update each bot to have its type match its name (for existing bots)
  const bots = await prisma.bot.findMany();
  
  for(const bot of bots) {
    await prisma.bot.update({
      where: { id: bot.id },
      // @ts-ignore - type field added to schema but not yet recognized by TypeScript
      data: { type: bot.name }
    });
    console.log(`Updated bot ${bot.name} with type ${bot.name}`);
  }
  
  console.log('Bot types updated successfully');
  exit(0);
}

updateBotTypes().catch(error => {
  console.error('Error updating bot types:', error);
  exit(1);
}); 