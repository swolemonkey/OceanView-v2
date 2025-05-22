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
async function spawnBot(botId, name) {
    const workerPath = name === 'hypertrades'
        ? path.resolve('src/botRunner/workers/hypertrades.ts')
        : path.resolve('src/botRunner/worker.ts');
    const worker = new Worker(workerPath, {
        workerData: { botId, name }
    });
    // pipe ticks
    // @ts-ignore - Working around type issues with ioredis-mock
    const sub = new IoRedisMock();
    sub.subscribe('chan:ticks');
    sub.on('message', (channel, msg) => worker.postMessage({ type: 'tick', data: msg }));
    // handle IPC order requests
    worker.on('message', async (m) => {
        if (m.type === 'order') {
            const { symbol, side, qty, price } = m;
            const res = await fetch(`http://localhost:${API_PORT}/api/order`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ symbol, side, qty, price })
            });
            const json = await res.json();
            worker.postMessage({ type: 'orderResult', data: json });
        }
    });
    worker.on('exit', code => {
        sub.quit();
        console.log(`bot ${name} exited`, code);
    });
    console.log(`bot ${name} started (thread ${worker.threadId})`);
}
export async function startBots() {
    const bots = await prisma.bot.findMany({ where: { enabled: true } });
    for (const b of bots)
        await spawnBot(b.id, b.name);
}
