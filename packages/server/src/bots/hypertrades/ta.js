import { Perception } from './perception.js';

export function taSignal(perception, cfg){
  const closes = perception.last(cfg.ta.rsiPeriod).map(c => c.c);
  if(closes.length < cfg.ta.rsiPeriod) return null;
  const diff = closes.slice(1).map((v, i) => v - closes[i]);
  const gain = diff.filter(x => x > 0).reduce((a, b) => a + b, 0);
  const loss = -diff.filter(x => x < 0).reduce((a, b) => a + b, 0) || 1e-6;
  const rs = gain/loss;
  const rsi = 100 - 100/(1+rs);
  if(rsi < cfg.ta.overSold)  return { type:'ta-long', rsi };
  if(rsi > cfg.ta.overBought) return { type:'ta-short', rsi };
  return null;
} 