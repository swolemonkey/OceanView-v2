import { Worker } from 'worker_threads';
import { prisma } from '../db.js';
import RedisMock from 'ioredis-mock';
import path from 'node:path';

// Create Redis clients correctly
const redis = new RedisMock();

async function spawnBot(botId:number, name:string){
  const worker = new Worker(path.resolve('src/botRunner/worker.ts'), {
    workerData:{ botId, name }
  });

  // pipe ticks
  const sub = new RedisMock();
  sub.subscribe('chan:ticks');
  sub.on('message', (channel: string, msg: string)=> worker.postMessage({ type:'tick', data:msg }));

  // handle IPC order requests
  worker.on('message', async (m: any)=>{
    if(m.type==='order'){
      const { symbol, side, qty, price } = m;
      const res = await fetch('http://localhost:3333/api/order',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body: JSON.stringify({symbol, side, qty, price})
      });
      const json = await res.json();
      worker.postMessage({ type:'orderResult', data:json });
    }
  });

  worker.on('exit', code=>{
    sub.quit();
    console.log(`bot ${name} exited`, code);
  });
  
  console.log(`bot ${name} started (thread ${worker.threadId})`);
}

export async function startBots(){
  const bots = await prisma.bot.findMany({ where:{ enabled:true }});
  for(const b of bots) await spawnBot(b.id, b.name);
} 