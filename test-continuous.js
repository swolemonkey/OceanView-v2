// Import the Redis mock library
const IoRedisMock = require('ioredis-mock');

// Create a Redis client
const redis = new IoRedisMock();

console.log('Starting continuous metrics test...');
console.log('Press Ctrl+C to stop');

// Initial values
let botA = { id: 1, equity: 1000, pnl: 50 };
let botB = { id: 2, equity: 1500, pnl: 75 };

// Random fluctuation function
function fluctuate(value, max = 5) {
  return value + (Math.random() * max * 2 - max);
}

// Send metrics every 2 seconds
const interval = setInterval(() => {
  // Update bot metrics with random fluctuations
  botA.equity = Math.round(fluctuate(botA.equity, 20));
  botA.pnl = Math.round(fluctuate(botA.pnl, 5));
  
  botB.equity = Math.round(fluctuate(botB.equity, 30));
  botB.pnl = Math.round(fluctuate(botB.pnl, 8));
  
  // Publish bot A metrics
  redis.publish('chan:metrics', JSON.stringify({ 
    botId: botA.id, 
    equity: botA.equity, 
    pnl: botA.pnl,
    type: 'metric'
  }));
  
  console.log(`Published metrics for Bot ${botA.id}: $${botA.equity} equity, $${botA.pnl} PnL`);
  
  // Publish bot B metrics 1 second later
  setTimeout(() => {
    redis.publish('chan:metrics', JSON.stringify({ 
      botId: botB.id, 
      equity: botB.equity, 
      pnl: botB.pnl,
      type: 'metric'
    }));
    
    console.log(`Published metrics for Bot ${botB.id}: $${botB.equity} equity, $${botB.pnl} PnL`);
  }, 1000);
  
}, 2000);

// Randomly send a promotion event every 15-30 seconds
function schedulePromotion() {
  const delay = 15000 + Math.random() * 15000;
  setTimeout(() => {
    const botId = Math.random() > 0.5 ? botA.id : botB.id;
    
    redis.publish('chan:metrics', JSON.stringify({ 
      promotion: true, 
      bot: botId 
    }));
    
    console.log(`Published promotion event for Bot ${botId}`);
    
    // Schedule next promotion
    schedulePromotion();
  }, delay);
}

// Start promotion schedule
schedulePromotion();

// Handle exit
process.on('SIGINT', () => {
  clearInterval(interval);
  console.log('Test stopped');
  process.exit();
}); 