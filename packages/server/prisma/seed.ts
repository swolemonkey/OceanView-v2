import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database with initial data...');

  // Seed the RLModel for gatekeeper
  const gatekeeperModel = await prisma.rLModel.upsert({
    where: { version: 'gatekeeper_v1' },
    update: {},
    create: {
      version: 'gatekeeper_v1',
      description: 'baseline LR',
      path: 'ml/gatekeeper_v1.onnx',
    },
  });

  console.log(`Seeded RLModel: ${gatekeeperModel.version} (${gatekeeperModel.id})`);

  // Initialize starting account state
  const accountState = await prisma.accountState.upsert({
    where: { id: 1 },
    update: {},
    create: {
      equity: 10000,
    },
  });

  console.log(`Initialized account with equity: $${accountState.equity}`);

  // Initialize a portfolio metric if needed
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0); // Start of day
  
  const portfolioMetric = await prisma.portfolioMetric.upsert({
    where: { date: currentDate },
    update: {},
    create: {
      date: currentDate,
      equityStart: 10000,
      equityEnd: 10000,
      dailyPnl: 0,
      maxOpenRisk: 0,
      maxDrawdown: 0,
    },
  });

  console.log(`Initialized portfolio metrics for ${currentDate.toISOString().split('T')[0]}`);
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 