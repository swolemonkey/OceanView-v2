import { loadConfig } from './config.js';
import { smcSignal } from './smc.js';
import { taSignal  } from './ta.js';
import { Perception } from './perception.js';

interface Config {
  smc: { thresh: number };
  ta: { rsiPeriod: number; overSold: number; overBought: number };
  riskPct: number;
  symbol: string;
}

export async function decide(perception: Perception, cfg?: Config){
  if (!cfg) {
    cfg = await loadConfig();
  }
  const s = smcSignal(perception, cfg);
  const t = taSignal(perception, cfg);

  if(s && s.type==='stop-hunt-long' && t && t.type==='ta-long'){
    const last = perception.last(1)[0].c;
    return {
      symbol: cfg.symbol,
      side: 'buy',
      qty: 0.001,
      price: last
    };
  }
  return null;
} 