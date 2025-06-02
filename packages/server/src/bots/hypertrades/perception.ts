export type Candle = { ts:number; o:number; h:number; l:number; c:number };

export class Perception {
  private candles: Candle[] = [];
  addTick(price:number, ts:number){
    const minute = Math.floor(ts/60000)*60000;
    let c = this.candles.at(-1);
    if(!c || c.ts !== minute){
      c = { ts: minute, o:price, h:price, l:price, c:price };
      this.candles.push(c);
      if(this.candles.length>500) this.candles.shift();
    }
    c.h = Math.max(c.h, price);
    c.l = Math.min(c.l, price);
    c.c = price;
  }
  last(n:number){
    return this.candles.slice(-n);
  }
  
  onCandleClose(candle: Candle) {
    // This method will be called when a candle is closed
    // Used for updating strategies
    const existingIndex = this.candles.findIndex(c => c.ts === candle.ts);
    if (existingIndex >= 0) {
      this.candles[existingIndex] = candle;
    } else {
      this.candles.push(candle);
      if (this.candles.length > 500) this.candles.shift();
    }
    return candle;
  }
} 