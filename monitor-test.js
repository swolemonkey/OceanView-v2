// Import the Redis mock library
const IoRedisMock = require('ioredis-mock');
const http = require('http');
const WebSocket = require('ws');

// Create a Redis client
const redis = new IoRedisMock();

// Check if UI server is accessible
http.get('http://localhost:5173/', (res) => {
  console.log('✅ UI Server is running on port 5173 (Status: ' + res.statusCode + ')');
  
  // Test WebSocket connection
  testWebSocket();
}).on('error', (err) => {
  console.error('❌ UI Server is not accessible:', err.message);
});

// Check if API server is accessible
http.get('http://localhost:3334/', (res) => {
  console.log('✅ API Server is running on port 3334 (Status: ' + res.statusCode + ')');
}).on('error', (err) => {
  console.error('❌ API Server is not accessible:', err.message);
});

function testWebSocket() {
  try {
    const ws = new WebSocket('ws://localhost:3334/ws/metrics');
    
    ws.on('open', () => {
      console.log('✅ WebSocket connection established');
      
      // Listen for messages from the WebSocket
      ws.on('message', (data) => {
        console.log('📊 Received WebSocket message:', data.toString());
      });
      
      // Start sending test metrics
      console.log('📈 Starting to send test metrics...');
      sendTestMetrics();
    });
    
    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
    });
  } catch (error) {
    console.error('❌ Failed to connect to WebSocket:', error.message);
  }
}

function sendTestMetrics() {
  // Send initial metrics for bot 1
  sendMetric(1, 1000, 50);
  
  // Send metrics for bot 2 after 1 second
  setTimeout(() => {
    sendMetric(2, 1500, 75);
  }, 1000);
  
  // Update bot 1 metrics after 2 seconds
  setTimeout(() => {
    sendMetric(1, 1050, 55);
  }, 2000);
  
  // Send promotion event after 3 seconds
  setTimeout(() => {
    sendPromotion(2);
  }, 3000);
  
  // Final update to both bots after 4 seconds
  setTimeout(() => {
    sendMetric(1, 1100, 60);
    sendMetric(2, 1520, 80);
    console.log('✅ Test completed successfully');
  }, 4000);
}

function sendMetric(botId, equity, pnl) {
  const data = { 
    botId: botId, 
    equity: equity, 
    pnl: pnl,
    type: 'metric'
  };
  
  redis.publish('chan:metrics', JSON.stringify(data));
  console.log(`📤 Published metric for bot ${botId}: $${equity} equity, $${pnl} PnL`);
}

function sendPromotion(botId) {
  const data = { 
    promotion: true, 
    bot: botId 
  };
  
  redis.publish('chan:metrics', JSON.stringify(data));
  console.log(`🎉 Published promotion event for bot ${botId}`);
} 