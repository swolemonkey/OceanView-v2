import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedHyperSettings() {
  try {
    console.log('Checking for existing HyperSettings...');
    const existingSettings = await prisma.hyperSettings.findUnique({
      where: { id: 1 }
    });

    if (existingSettings) {
      console.log('HyperSettings already exist:', existingSettings);
    } else {
      console.log('Creating HyperSettings...');
      const settings = await prisma.hyperSettings.create({
        data: {
          id: 1,
          smcThresh: 0.002,
          rsiOS: 35,
          riskPct: 1,
          symbols: 'bitcoin,ethereum,solana'
        }
      });
      
      console.log('Created HyperSettings:', settings);
    }
  } catch (error) {
    console.error('Error seeding HyperSettings:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedHyperSettings().then(() => {
  console.log('HyperSettings seeding complete');
}); 