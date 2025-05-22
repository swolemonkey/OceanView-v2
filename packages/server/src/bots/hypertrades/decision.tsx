import { defaultConfig } from './config.tsx';
import { smcSignal } from './smc.tsx';
import { taSignal  } from './ta.tsx';
import { Perception } from './perception.tsx';

export function decide(perception: Perception){
  const cfg = defaultConfig;
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