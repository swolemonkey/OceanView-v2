import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTables() {
  try {
    // Check BotHeartbeat
    const botHeartbeat = await prisma.botHeartbeat.findFirst();
    console.log('BotHeartbeat exists:', botHeartbeat !== null);

    // Check PortfolioMetric
    const portfolioMetric = await prisma.portfolioMetric.findFirst();
    console.log('PortfolioMetric exists:', portfolioMetric !== null);

    // Check EvolutionMetric
    const evolutionMetric = await prisma.evolutionMetric.findFirst();
    console.log('EvolutionMetric exists:', evolutionMetric !== null);

    // Check RLDataset
    const rlDataset = await prisma.rLDataset.findFirst();
    console.log('RLDataset exists:', rlDataset !== null);
    
    // Check HyperSettings
    const hyperSettings = await prisma.hyperSettings.findFirst();
    console.log('HyperSettings exists:', hyperSettings !== null);
    
    console.log('\nTable schemas:');
    
    // Get details about BotHeartbeat
    if (botHeartbeat) {
      console.log('BotHeartbeat fields:', Object.keys(botHeartbeat));
    }
    
    // Get details about RLDataset
    if (rlDataset) {
      console.log('RLDataset fields:', Object.keys(rlDataset));
    } else {
      // Create a sample RLDataset to see its structure
      console.log('Creating sample RLDataset to check structure...');
      try {
        const sample = await prisma.rLDataset.create({
          data: {
            symbol: 'bitcoin',
            featureVec: JSON.stringify({
              rsi14: 35.5,
              fastMA: 48000,
              slowMA: 45000
            }),
            action: 'buy',
            outcome: 100,
            gateScore: 0.75
          }
        });
        console.log('RLDataset fields:', Object.keys(sample));
        console.log('RLDataset has gateScore:', 'gateScore' in sample);
      } catch (error) {
        console.error('Error creating RLDataset:', error);
      }
    }
    
    // Get details about HyperSettings
    if (hyperSettings) {
      console.log('HyperSettings fields:', Object.keys(hyperSettings));
      console.log('HyperSettings has gatekeeperThresh:', 'gatekeeperThresh' in hyperSettings);
    }
    
  } catch (error) {
    console.error('Error checking tables:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTables(); 