import { parentPort, workerData } from 'worker_threads';
import { Perception } from '../../bots/hypertrades/perception.js';
import { decide } from '../../bots/hypertrades/decision.js';
import { RiskManager } from '../../bots/hypertrades/risk.js';

const perception = new Perception();
const risk = new RiskManager();

// fire a tiny order once on startup for connectivity test
parentPort?.postMessage({
  type: 'order',
  symbol: 'bitcoin',
  side: 'buy',
  qty: 0.0001,
  price: 99999 // sentinel; SimExecution ignores price realism
});

parentPort?.on('message', (m) => {
  if (m.type === 'tick') {
    const { prices, ts } = JSON.parse(m.data);
    const btc = prices.bitcoin?.usd;
    if (!btc) return;

    perception.addTick(btc, Date.parse(ts));
    const idea = decide(perception);
    if (idea) {
      if (!risk.canTrade()) {
        console.log(`[${workerData.name}] risk blocked trade`);
        return;
      }
      const qty = risk.sizeTrade(idea.price);
      parentPort?.postMessage({ type: 'order', ...idea, qty });
      risk.registerOrder(idea.side as 'buy'|'sell', qty, idea.price);
    }
  }
  
  if (m.type === 'orderResult') {
    console.log(`[${workerData.name}] order result`, m.data);
    const { order } = m.data;
    risk.closePosition(order.qty, order.price);
  }
}); 