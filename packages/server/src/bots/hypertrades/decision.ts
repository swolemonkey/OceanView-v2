import { loadConfig } from './config';
import { smcSignal } from './smc';
import { taSignal  } from './ta';
import { Perception } from './perception';

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
  
  // Skip if not enough data
  if (perception.last(2).length < 2) {
    return null;
  }
  
  const s = smcSignal(perception, cfg);
  const t = taSignal(perception, cfg);

  // Create detailed reason for logging
  let reason = "";
  if (s) reason += `SMC:${s.type} `;
  if (t) reason += `TA:${t.type}`;
  
  // If no signals, provide reason for holding
  if (!s && !t) {
    reason = "No signals detected";
  } else if (!s) {
    reason = `Missing SMC confirmation (${reason.trim()})`;
  } else if (!t) {
    reason = `Missing TA confirmation (${reason.trim()})`;
  }

  if(s && s.type==='stop-hunt-long' && t && t.type==='ta-long'){
    const last = perception.last(1)[0].c;
    const idea: any = {
      symbol: cfg.symbol,
      side: 'buy',
      qty: 0.001,
      price: last,
      reason: `Buy signal: ${reason}`
    };
    const prev = perception.last(2)[0];
    idea.stop = prev.l * 0.99;
    idea.target = prev.h;
    return idea;
  }
  
  // Return null with reason property for logging
  return {
    symbol: cfg.symbol,
    action: 'hold',
    reason
  };
} 