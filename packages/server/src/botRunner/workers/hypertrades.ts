import { parentPort, workerData } from 'worker_threads';
import { Perception } from '../../bots/hypertrades/perception.js';
import { decide } from '../../bots/hypertrades/decision.js';
import { RiskManager } from '../../bots/hypertrades/risk.js';
import { executeIdea } from '../../bots/hypertrades/execution.js';
import { loadConfig } from '../../bots/hypertrades/config.js';
import { prisma } from '../../db.js';

interface Config {
  smc: { thresh: number };
  ta: { rsiPeriod: number; overSold: number; overBought: number };
  riskPct: number;
  symbol: string;
}

const perception = new Perception();
const risk = new RiskManager();
const log = (...a:any[]) => console.log(`[hypertrades]`, ...a);

// Initialize config
let cfg: Config;
async function init() {
  cfg = await loadConfig();
}

init().catch(err => console.error('[hypertrades] init error:', err));

parentPort?.on('message', async (m) => {
  if (m.type === 'tick') {
    const { prices, ts } = JSON.parse(m.data);
    const btc = prices.bitcoin?.usd;
    if (!btc) return;

    perception.addTick(btc, Date.parse(ts));
    const idea = await decide(perception, cfg);
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
    await prisma.experience.create({
      data:{
        symbol: order.symbol,
        price:  order.price,
        smcThresh: cfg.smc.thresh,
        rsiOS: cfg.ta.overSold,
        reward: risk.dayPnL   // simplistic reward = daily PnL
      }
    });
  }
}); 