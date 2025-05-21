import { Worker } from 'worker_threads';
import { prisma } from '../db.js';
import Redis from 'ioredis';
import path from 'node:path';

const redis = new Redis(process.env.REDIS_URL!);

async function spawnBot(botId:number, name:string){
  const worker = new Worker(path.resolve('src/botRunner/worker.js'), {
    workerData:{ botId, name }
  });

  // pipe ticks
  const sub = new Redis(process.env.REDIS_URL!);
  sub.subscribe('chan:ticks');
  sub.on('message', (_c, msg)=> worker.postMessage({ type:'tick', data:msg }));

  // handle IPC order requests
  worker.on('message', async (m)=>{
    if(m.type==='order'){
      const { symbol, side, qty, price } = m;
      const res = await fetch('http://localhost:3000/api/order',{
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
}

export async function startBots(){
  const bots = await prisma.bot.findMany({ where:{ enabled:true }});
  for(const b of bots) await spawnBot(b.id, b.name);
} 