import { defaultConfig } from './config.js';
import { prisma } from '../../db.js';
import type { Config } from './config.js';

type Position = { qty:number; entry:number; side:'buy'|'sell'; stop?: number };

export class RiskManager {
  equity = 10_000;                // account equity USD
  openRisk = 0;                   // % of equity currently at risk
  dayPnL   = 0;                   // realised profit today
  positions: Position[] = [];
  botId?: number;                 // bot id for database updates
  config: Config;                 // configuration 
  versionId?: number;             // strategy version for logging

  constructor(botId?: number, config?: Config) {
    this.botId = botId;
    this.config = config || defaultConfig;
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

  sizeTrade(stop: number, price: number) {
    const risk$ = this.equity * (this.config.riskPct/100);
    const priceDiff = Math.abs(price - stop);
    const qty = risk$ / priceDiff;
    return qty;
  }

  updateStops(price: number) {
    // No-op for now, can be implemented for trailing stops
    return;
  }

  canTrade(){
    if(this.openRisk > 2)   return false;
    if(this.dayPnL  < -0.03*this.equity) return false;
    return true;
  }

  registerOrder(side:'buy'|'sell', qty:number, price:number, stop?: number) {
    const effectiveStop = stop || price * 0.01;  // 1% default if not provided
    const riskPct = (qty * Math.abs(price - effectiveStop)) / this.equity * 100;
    this.openRisk += riskPct;
    this.positions.push({ qty, entry: price, side, stop: effectiveStop });
  }

  // simplistic close handling (fills always at price)
  async closePosition(qty:number, price:number, fee:number = 0){
    const pos = this.positions.shift();
    if(!pos) return;
    let pnl = pos.side==='buy'
      ? (price-pos.entry)*qty
      : (pos.entry-price)*qty;
    
    const totalFee = fee || price * qty * 0.0004;
    pnl -= totalFee;             // subtract commission
    
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
          data: { 
            equity: this.equity,
            pnlToday: this.dayPnL
          }
        });
      } catch (err) {
        console.error('Failed to update equity:', err);
      }
    }
  }
} 