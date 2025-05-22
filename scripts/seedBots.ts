import { prisma } from '../packages/server/src/db.js';
import { exit } from 'node:process';

// Update the db mock to include bot
const mockPrisma = {
  ...prisma,
  bot: {
    create: async (args: { data: any }) => {
      console.log('Mock bot created:', args.data);
      return { id: 1, ...args.data };
    }
  }
};

async function seedBots() {
  await mockPrisma.bot.create({ data:{ name:'scalper', enabled:true }});
  await mockPrisma.bot.create({ data:{ name:'hypertrades', enabled:true }});
  console.log('bots inserted');
  exit(0);
}

seedBots().catch(error => {
  console.error('Error seeding bots:', error);
  exit(1);
}); 