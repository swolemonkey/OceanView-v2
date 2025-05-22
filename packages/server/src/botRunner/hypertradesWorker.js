import { parentPort, workerData } from 'worker_threads';
import { Perception } from '../bots/hypertrades/perception.js';
import { decide } from '../bots/hypertrades/decision.js';

const perception = new Perception();

// fire a tiny order once on startup for connectivity test
parentPort.postMessage({
  type: 'order',
  symbol: 'bitcoin',
  side: 'buy',
  qty: 0.0001,
  price: 99999 // sentinel; SimExecution ignores price realism
});

parentPort.on('message', (m) => {
  if (m.type === 'tick') {
    const { prices, ts } = JSON.parse(m.data);
    const btc = prices.bitcoin?.usd;
    if (!btc) return;

    perception.addTick(btc, Date.parse(ts));
    const idea = decide(perception);
    if (idea) {
      parentPort.postMessage({ type: 'order', ...idea });
    }
  }
  
  if (m.type === 'orderResult') {
    console.log(`[${workerData.name}] order result`, m.data);
  }
}); 