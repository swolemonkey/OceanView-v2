// Import the Redis mock library
const IoRedisMock = require('ioredis-mock');

// Create a Redis client
const redis = new IoRedisMock();

// Publish a test metric
redis.publish('chan:metrics', JSON.stringify({ 
  botId: 1, 
  equity: 1000, 
  pnl: 50 
}));

console.log('Published test metric');

// Publish a test promotion
setTimeout(() => {
  redis.publish('chan:metrics', JSON.stringify({ 
    promotion: true, 
    bot: 2 
  }));
  console.log('Published test promotion');
}, 3000); 