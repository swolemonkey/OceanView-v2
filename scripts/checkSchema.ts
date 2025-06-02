import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSchema() {
  console.log('Checking required tables and fields...\n');
  
  try {
    // Check BotHeartbeat
    const botHeartbeat = await prisma.botHeartbeat.findFirst();
    console.log('✅ BotHeartbeat table exists');
    if (botHeartbeat) {
      console.log('   Fields:', Object.keys(botHeartbeat).join(', '));
    } else {
      // Create a sample record if none exists
      const sample = await prisma.botHeartbeat.create({
        data: { status: 'ok', details: 'Schema verification' }
      });
      console.log('   Fields:', Object.keys(sample).join(', '));
      // Delete the sample record
      await prisma.botHeartbeat.delete({ where: { id: sample.id } });
    }
    
    // Check PortfolioMetric
    const portfolioMetric = await prisma.portfolioMetric.findFirst();
    console.log('✅ PortfolioMetric table exists');
    if (portfolioMetric) {
      console.log('   Fields:', Object.keys(portfolioMetric).join(', '));
    }
    
    // Check EvolutionMetric
    const evolutionMetric = await prisma.evolutionMetric.findFirst();
    console.log('✅ EvolutionMetric table exists');
    if (evolutionMetric) {
      console.log('   Fields:', Object.keys(evolutionMetric).join(', '));
    }
    
    // Check RLDataset with gateScore
    try {
      const rlDataset = await prisma.rLDataset.findFirst();
      console.log('✅ RLDataset table exists');
      
      if (rlDataset) {
        console.log('   Fields:', Object.keys(rlDataset).join(', '));
        console.log('   Has gateScore field:', 'gateScore' in rlDataset);
      } else {
        // Create a sample record to check schema
        const sample = await prisma.rLDataset.create({
          data: {
            symbol: 'bitcoin',
            featureVec: JSON.stringify({ test: true }),
            action: 'buy',
            outcome: 0,
            gateScore: 0.75
          }
        });
        console.log('   Fields:', Object.keys(sample).join(', '));
        console.log('   Has gateScore field:', 'gateScore' in sample);
        
        // Delete the sample record
        await prisma.rLDataset.delete({ where: { id: sample.id } });
      }
    } catch (error) {
      console.error('❌ Error checking RLDataset:', error);
    }
    
    // Check HyperSettings new columns
    const hyperSettings = await prisma.hyperSettings.findFirst();
    console.log('✅ HyperSettings table exists');
    if (hyperSettings) {
      console.log('   Fields:', Object.keys(hyperSettings).join(', '));
      console.log('   Has gatekeeperThresh:', 'gatekeeperThresh' in hyperSettings);
    }
    
    console.log('\nSchema verification completed!');
  } catch (error) {
    console.error('Error verifying schema:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSchema(); 