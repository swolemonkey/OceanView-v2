import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAssets() {
  try {
    await prisma.$connect();
    console.log('Connected to database successfully');
    
    const assets = await prisma.tradableAsset.findMany({ 
      where: { active: true },
      select: { symbol: true, name: true, active: true }
    });
    
    console.log('\n📊 Active tradable assets:');
    console.table(assets);
    console.log(`\n✅ Total active assets: ${assets.length}`);
    
    // Also check if there are any inactive assets
    const inactiveAssets = await prisma.tradableAsset.findMany({ 
      where: { active: false },
      select: { symbol: true, name: true, active: true }
    });
    
    if (inactiveAssets.length > 0) {
      console.log('\n⚠️ Inactive assets:');
      console.table(inactiveAssets);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAssets(); 