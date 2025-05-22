import { defaultConfig } from './config.js';

type Position = { qty:number; entry:number; side:'buy'|'sell' };

export class RiskManager {
  equity = 10_000;                // stubbed account equity USD
  openRisk = 0;                   // % of equity currently at risk
  dayPnL   = 0;                   // realised profit today
  positions: Position[] = [];

  sizeTrade(price:number){
    const cfg = defaultConfig;
    const stop = price * 0.01;                  // 1 % ATR proxy
    const risk$ = this.equity * (cfg.riskPct/100);
    const qty   = risk$ / stop;
    return qty;
  }

  canTrade(){
    if(this.openRisk > 2)   return false;
    if(this.dayPnL  < -0.03*this.equity) return false;
    return true;
  }

  registerOrder(side:'buy'|'sell', qty:number, price:number){
    const stop = price*0.01;
    const riskPct = (qty*stop)/this.equity*100;
    this.openRisk += riskPct;
    this.positions.push({ qty, entry:price, side });
  }

  // simplistic close handling (fills always at price)
  closePosition(qty:number, price:number){
    const pos = this.positions.shift();
    if(!pos) return;
    const pnl = pos.side==='buy'
      ? (price-pos.entry)*qty
      : (pos.entry-price)*qty;
    this.dayPnL += pnl;
    const stop = pos.entry*0.01;
    this.openRisk -= (qty*stop)/this.equity*100;
  }
} 