import { Perception } from './perception.js';

interface SMCConfig {
  thresh: number;
}

interface Config {
  smc: SMCConfig;
}

export function smcSignal(perception: Perception, cfg: Config) {
  const c = perception.last(3);
  if(c.length<3) return null;
  const [prev, , now] = c;
  const drop = (prev.l - now.c)/prev.l;
  if(drop > cfg.smc.thresh) return { type:'stop-hunt-long' };
  return null;
} 