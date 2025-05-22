import { Worker } from 'worker_threads';
import { prisma } from '../db.js';
// Import just the module for type checking workarounds
import IoRedisMock from 'ioredis-mock';
import path from 'node:path';

// Get API port from environment
const API_PORT = process.env.PORT || '3334';

// Mock Redis clients for development/testing
// @ts-ignore - Working around type issues with ioredis-mock
const redis = new IoRedisMock();

async function spawnBot(botId:number, name:string, type:string){
  let running = true;

  // Keep respawning the worker as long as the bot should be running
  while (running) {
    try {
      const workerPath = path.resolve(`src/botRunner/workers/${type}.ts`);
      
      const worker = new Worker(workerPath, {
        workerData:{ botId, name, type }
      });

      // pipe ticks
      // @ts-ignore - Working around type issues with ioredis-mock
      const sub = new IoRedisMock();
      sub.subscribe('chan:ticks');
      sub.on('message', (channel: string, msg: string)=> worker.postMessage({ type:'tick', data:msg }));

      // handle IPC order requests
      worker.on('message', async (m: any)=>{
        if(m.type==='order'){
          const { symbol, side, qty, price } = m;
          const res = await fetch(`http://localhost:${API_PORT}/api/order`,{
            method:'POST',
            headers:{'content-type':'application/json'},
            body: JSON.stringify({symbol, side, qty, price})
          });
          const json = await res.json();
          worker.postMessage({ type:'orderResult', data:json });
        }
      });

      // Set up for auto-restart on unexpected exit
      await new Promise<void>((resolve) => {
        worker.on('exit', code => {
          sub.quit();
          console.log(`Bot ${name} exited with code ${code}`);
          resolve();
        });
        
        console.log(`Bot ${name} started (thread ${worker.threadId})`);
      });
      
      // Check if the bot is still enabled before respawning
      // In a mock environment, we'll just check if it exists in the mock data
      const bots = await prisma.bot.findMany({ where: { id: botId } });
      const botStatus = bots.find(b => b.id === botId);
      running = botStatus?.enabled || false;
      
      if (running) {
        console.log(`Bot ${name} will restart in 2 seconds...`);
        // Wait 2 seconds before respawning
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`Error in bot ${name}:`, error);
      // Wait 2 seconds before trying again
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(`Bot ${name} disabled, not restarting.`);
}

export async function startBots(){
  const bots = await prisma.bot.findMany({ where:{ enabled:true }});
  // @ts-ignore - type field added to schema but not yet recognized by TypeScript
  for(const b of bots) await spawnBot(b.id, b.name, b.type);
} 