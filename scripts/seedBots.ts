import { prisma } from '../packages/server/src/db.js';
await prisma.bot.create({ data:{ name:'scalper', enabled:true }});
console.log('bot inserted');
process.exit(0); 