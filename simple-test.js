// Import the Redis mock library
const IoRedisMock = require('ioredis-mock');

// Create a Redis client
const redis = new IoRedisMock();

console.log('Sending test metrics every second for 10 seconds...');

// Send metrics every second for 10 seconds
let count = 0;
const interval = setInterval(() => {
  count++;
  const botId = 1;
  const equity = 1000 + (count * 10);
  const pnl = 50 + count;
  
  // Publish metric
  redis.publish('chan:metrics', JSON.stringify({ 
    botId, 
    equity, 
    pnl,
    type: 'metric'
  }));
  
  console.log(`Published metric #${count} for bot ${botId}: $${equity} equity, $${pnl} PnL`);
  
  // Send a promotion on the 5th message
  if (count === 5) {
    redis.publish('chan:metrics', JSON.stringify({ 
      promotion: true, 
      bot: botId 
    }));
    console.log(`Published promotion event for bot ${botId}`);
  }
  
  // Stop after 10 messages
  if (count >= 10) {
    clearInterval(interval);
    console.log('Test completed. Check the browser to see if metrics and promotion alert appeared.');
  }
}, 1000); 