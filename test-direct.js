const WebSocket = require('ws');
const url = require('url');

// Create WebSocket server
const wss = new WebSocket.Server({ port: 3334 });

console.log('WebSocket server started on port 3334');

// Bot data
const bots = [
  { id: 1, name: 'Bot 1', equity: 1000, pnl: 50 },
  { id: 2, name: 'Bot 2', equity: 1500, pnl: 75 }
];

// Handle connections
wss.on('connection', (ws, req) => {
  const pathname = url.parse(req.url).pathname || '/';
  console.log(`Client connected: ${req.url}`);
  
  // Handle all connections - treat root path same as /ws/metrics
  if (pathname === '/' || pathname === '/ws/metrics') {
    console.log('Valid WebSocket connection established');
    
    // Send a test message every second for each bot
    let count = 0;
    const interval = setInterval(() => {
      count++;
      
      // Update both bots
      bots.forEach(bot => {
        // Add some random fluctuation
        bot.equity = Math.round(bot.equity + (Math.random() * 40 - 20));
        bot.pnl = Math.round(bot.pnl + (Math.random() * 10 - 5));
        
        const message = JSON.stringify({ 
          botId: bot.id, 
          equity: bot.equity, 
          pnl: bot.pnl,
          type: 'metric'
        });
        
        try {
          ws.send(message);
          console.log(`Sent metric #${count} for Bot ${bot.id}: $${bot.equity} equity, $${bot.pnl} PnL`);
        } catch (err) {
          console.error('Error sending message:', err);
        }
      });
      
      // Send a promotion event every 10 messages
      if (count % 10 === 0) {
        const botId = Math.random() > 0.5 ? 1 : 2;
        try {
          ws.send(JSON.stringify({ 
            promotion: true, 
            bot: botId 
          }));
          console.log(`Sent promotion event for bot ${botId}`);
        } catch (err) {
          console.error('Error sending promotion:', err);
        }
      }
      
      // Stop after 100 messages
      if (count >= 100) {
        clearInterval(interval);
        console.log('Test completed');
      }
    }, 1000);
    
    // Handle client messages
    ws.on('message', (message) => {
      console.log('Received from client:', message.toString());
    });
    
    // Handle disconnection
    ws.on('close', () => {
      clearInterval(interval);
      console.log('Client disconnected');
    });
  } else {
    console.log(`Unsupported WebSocket path: ${pathname}`);
    ws.close();
  }
});

// Handle server shutdown
process.on('SIGINT', () => {
  wss.close();
  console.log('WebSocket server stopped');
  process.exit();
}); 