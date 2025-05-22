import { parentPort, workerData } from 'worker_threads';
import { Perception } from '../../bots/hypertrades/perception.js';
import { decide } from '../../bots/hypertrades/decision.js';
import { RiskManager } from '../../bots/hypertrades/risk.js';
import { executeIdea } from '../../bots/hypertrades/execution.js';

const perception = new Perception();
const risk = new RiskManager();
const log = (...a:any[]) => console.log(`[hypertrades]`, ...a);

// Remove the tiny order test

parentPort?.on('message', (m) => {
  if (m.type === 'tick') {
    const { prices, ts } = JSON.parse(m.data);
    const btc = prices.bitcoin?.usd;
    if (!btc) return;

    perception.addTick(btc, Date.parse(ts));
    const idea = decide(perception);
    if (idea) {
      if (!risk.canTrade()) {
        log('risk-blocked');
        return;
      }
      const qty = risk.sizeTrade(idea.price);
      const orderIdea = { 
        ...idea, 
        side: idea.side as 'buy'|'sell',
        qty 
      };
      executeIdea(orderIdea, log);
      risk.registerOrder(idea.side as 'buy'|'sell', qty, idea.price);
    }
  }
  
  if (m.type === 'orderResult') {
    console.log(`[${workerData.name}] order result`, m.data);
    const { order } = m.data;
    risk.closePosition(order.qty, order.price);
  }
}); 