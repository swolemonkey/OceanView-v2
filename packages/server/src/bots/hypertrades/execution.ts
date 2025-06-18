// Use dynamic import to avoid ESM issues in tests
const fetch = async (...args: any[]) => {
  const mod = await import('node-fetch');
  return (mod.default as any)(...args);
};
import { defaultConfig, execCfg } from './config.js';
import { prisma } from '../../db.js';

// Use values from config with fallbacks
const SLIPPAGE_LIMIT = defaultConfig.execution?.slippageLimit || 0.002;  // 0.2% default
const VALUE_SPLIT = defaultConfig.execution?.valueSplit || 2000;         // $2000 default
const TIMEOUT_MS = defaultConfig.execution?.timeoutMs || 3000;           // 3s default

type TradeIdea = { symbol:string; side:'buy'|'sell'; qty:number; price:number };

export async function executeIdea(idea:TradeIdea, logger:(msg: string)=>void, attempt: number = 0){
  const chunks = idea.qty * idea.price > VALUE_SPLIT
    ? [idea.qty/3, idea.qty/3, idea.qty - 2*(idea.qty/3)]
    : [idea.qty];

  for(const q of chunks){
    const ctl = new AbortController();
    const t = setTimeout(()=>ctl.abort(), TIMEOUT_MS);

    try{
      const res = await fetch('http://localhost:3334/api/order',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body: JSON.stringify({ ...idea, qty:q }),
        signal: ctl.signal
      });
      clearTimeout(t);
      if(!res.ok){ logger(`order failed (${res.status})`); continue; }
      const json:any = await res.json();
      const fill = json.order?.price ?? idea.price;
      const slip = Math.abs(fill - idea.price)/idea.price;
      if(slip > SLIPPAGE_LIMIT){
        logger(`badFill slippage ${(slip*100).toFixed(2)}%`);
      }
    }catch(e: unknown){
      logger(`timeout/cancel for chunk qty ${q}`);
      // retry once
      if(e instanceof Error && e.name==='AbortError' && attempt < 1){
        logger('retrying once…');
        return executeIdea({ ...idea, qty:q }, logger, attempt + 1);
      } else if(attempt >= 1) {
        logger('max retries reached, aborting');
      }
    }
  }
}

/**
 * Log a completed trade to the database
 */
export async function logCompletedTrade(order: {
  symbol: string;
  side: string;
  price: number;
  qty: number;
  reason?: string;
  exitReason?: string;
  pnl: number;
  entryTs: number;
}, botName: string, versionId: number) {
  try {
    await prisma.strategyTrade.create({
      data: {
        ts: new Date(),
        botName,
        strategyVersionId: versionId,
        symbol: order.symbol,
        side: order.side,
        price: order.price,
        size: order.qty,
        entryReason: order.reason ?? 'n/a',
        exitReason: order.exitReason ?? 'n/a',
        pnl: order.pnl,
        durationMs: Date.now() - order.entryTs
      }
    });
  } catch (error) {
    console.error('[logCompletedTrade] Error logging trade:', error);
  }
} 