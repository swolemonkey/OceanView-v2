import { defaultConfig } from './config.js';
import { prisma } from '../../db.js';

type Position = { qty:number; entry:number; side:'buy'|'sell' };

export class RiskManager {
  equity = 10_000;                // account equity USD
  openRisk = 0;                   // % of equity currently at risk
  dayPnL   = 0;                   // realised profit today
  positions: Position[] = [];
  botId?: number;                 // bot id for database updates

  constructor(botId?: number) {
    this.botId = botId;
    this.loadEquity();
  }

  async loadEquity() {
    if (!this.botId) return;
    
    try {
      // @ts-ignore - Working with new schema field
      const bot = await prisma.bot.findUnique({ where: { id: this.botId } });
      if (bot?.equity) {
        this.equity = bot.equity;
      }
    } catch (err) {
      console.error('Failed to load equity:', err);
    }
  }

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
  async closePosition(qty:number, price:number){
    const pos = this.positions.shift();
    if(!pos) return;
    const pnl = pos.side==='buy'
      ? (price-pos.entry)*qty
      : (pos.entry-price)*qty;
    this.dayPnL += pnl;
    this.equity += pnl;
    const stop = pos.entry*0.01;
    this.openRisk -= (qty*stop)/this.equity*100;
    
    // Update equity in database
    if (this.botId) {
      try {
        // @ts-ignore - Working with new schema field
        await prisma.bot.update({ 
          where: { id: this.botId },
          data: { equity: this.equity }
        });
      } catch (err) {
        console.error('Failed to update equity:', err);
      }
    }
  }
} 