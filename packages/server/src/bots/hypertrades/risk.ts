import { defaultConfig } from './config.js';
import { prisma } from '@/db.js';
import type { Config } from './config.js';
import type { Perception } from './perception.js';
import { IndicatorCache } from './indicators/cache.js';

// Logger interface
interface Logger {
  info: (data: any, message: string) => void;
  warn: (data: any, message: string) => void;
  error: (data: any, message: string) => void;
}

// Use a safer global logger reference
declare global {
  var logger: Logger | undefined;
}

type Position = { 
  qty: number; 
  entry: number; 
  side: 'buy'|'sell'; 
  stop?: number; 
  stopLoss?: number;
  symbol?: string; // Optional symbol reference for logging
};

export class RiskManager {
  equity = 10_000;                // account equity USD
  openRisk = 0;                   // % of equity currently at risk
  dayPnL   = 0;                   // realised profit today
  positions: Position[] = [];
  botId?: number;                 // bot id for database updates
  config: Config;                 // configuration 
  versionId?: number;             // strategy version for logging
  private perception?: Perception; // Market perception for indicators
  private atrMultiple: number = 1.5;  // Default ATR multiple for stop calculation
  private atrPeriod: number = 14;    // Default ATR period

  constructor(botId?: number, config?: Config, perception?: Perception, atrMultiple: number = 1.5, atrPeriod: number = 14) {
    this.botId = botId;
    this.config = config || defaultConfig;
    this.perception = perception;
    this.atrMultiple = atrMultiple;
    this.atrPeriod = atrPeriod;
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

  updateStops(position: Position): number | null {
    if (!this.perception) return null;
    
    // Get the indicators from perception
    const indicators = this.perception as unknown as { indicators: IndicatorCache };
    const atr = indicators?.indicators?.atr?.(this.atrPeriod) || 0;
    if (atr === 0) return null; // safety check if insufficient data
    
    const lastCandles = this.perception.last(1);
    if (!lastCandles || lastCandles.length === 0) return null;
    
    const lastCandle = lastCandles[0];
    let newStop: number | null = null;
    
    if (position.side === 'buy') {
      // For long positions, trail below the price
      const trailingStop = lastCandle.c - (atr * this.atrMultiple);
      newStop = Math.max(position.stop ?? -Infinity, trailingStop);
    } else if (position.side === 'sell') {
      // For short positions, trail above the price
      const trailingStop = lastCandle.c + (atr * this.atrMultiple);
      newStop = Math.min(position.stop ?? Infinity, trailingStop);
    }
    
    // Log the trailing stop adjustment if a change was made
    if (newStop !== null && newStop !== position.stop) {
      const symbol = position.symbol || 'unknown';
      console.log(`Trailing stop adjusted for ${symbol}: ${position.stop} -> ${newStop} (ATR: ${atr.toFixed(2)}, Multiple: ${this.atrMultiple})`);
      
      // Use logger if available
      if (typeof global.logger !== 'undefined') {
        global.logger.info({ 
          symbol, 
          oldStop: position.stop, 
          newStop, 
          atr,
          atrMultiple: this.atrMultiple 
        }, "Trailing stop adjusted");
      }
    }
    
    return newStop;
  }

  canTrade(){
    // DEPRECATED: Use PortfolioRiskManager.canTrade() instead
    // This method will be removed in a future release
    return true;  // Always return true, portfolio risk manager will handle risk checks
  }

  registerOrder(side:'buy'|'sell', qty:number, price:number, stop?: number) {
    const effectiveStop = stop || price * 0.01;  // 1% default if not provided
    const riskPct = (qty * Math.abs(price - effectiveStop)) / this.equity * 100;
    this.openRisk += riskPct;
    this.positions.push({ 
      qty, 
      entry: price, 
      side, 
      stop: effectiveStop,
      stopLoss: effectiveStop // Initialize stopLoss with the same value as stop
    });
    
    // Apply trailing stop immediately if perception is available
    if (this.positions.length > 0 && this.perception) {
      const latestPosition = this.positions[this.positions.length - 1];
      const newStop = this.updateStops(latestPosition);
      if (newStop !== null) {
        latestPosition.stop = newStop;
      }
    }
  }

  // simplistic close handling (fills always at price)
  async closePosition(qty:number, price:number, fee:number = 0){
    const pos = this.positions.shift();
    if(!pos) return 0; // Return 0 if no position found
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
        
        // Persist equity to accountState
        await prisma.accountState.upsert({ 
          where: { id: 1 }, 
          update: { equity: this.equity },
          create: { id: 1, equity: this.equity }
        });
      } catch (err) {
        console.error('Failed to update equity:', err);
      }
    }

    // Return the individual trade PnL
    return pnl;
  }

  /**
   * Update stops for all open positions based on current market conditions
   * @returns Array of updated stop values or null if no update was made
   */
  updateAllStops(): (number | null)[] {
    if (!this.perception || this.positions.length === 0) return [];
    
    return this.positions.map(position => {
      const newStop = this.updateStops(position);
      if (newStop !== null) {
        position.stop = newStop;
      }
      return newStop;
    });
  }
}

export default RiskManager; 