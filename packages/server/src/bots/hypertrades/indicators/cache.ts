export class IndicatorCache {
  private closes:number[]=[];
  private highs:number[]=[];
  private lows:number[]=[];
  rsi14=50; fastMA=0; slowMA=0;
  adx14=25; bbWidth=0; atr14=0;
  avgSent=0; avgOB=0; // sentiment and order book pressure
  
  updateOnClose(close:number, high?:number, low?:number){
    this.closes.push(close);
    
    // Use the provided high/low or fallback to close value
    this.highs.push(high || close);
    this.lows.push(low || close);
    
    // Keep the arrays at a manageable size
    if(this.closes.length>200) {
      this.closes.shift();
      this.highs.shift();
      this.lows.shift();
    }
    
    // compute RSI 14 only once per candle
    if(this.closes.length>14){
      const deltas=this.closes.slice(-14-1);
      const gains=deltas.map((v,i)=>Math.max(deltas[i+1]-v,0)).slice(0,14);
      const losses=deltas.map((v,i)=>Math.max(v-deltas[i+1],0)).slice(0,14);
      const avgG=gains.reduce((a,b)=>a+b,0)/14;
      const avgL=losses.reduce((a,b)=>a+b,0)/14;
      const rs=avgL?avgG/avgL:100; this.rsi14=100-100/(1+rs);
    }
    
    // fast/slow MA
    const last50=this.closes.slice(-50); this.fastMA=last50.reduce((a,b)=>a+b,0)/last50.length;
    const last200=this.closes.slice(-200); this.slowMA=last200.reduce((a,b)=>a+b,0)/last200.length;
    
    // Calculate Bollinger Bands (20-period SMA with 2 standard deviations)
    if(this.closes.length >= 20) {
      const last20 = this.closes.slice(-20);
      const sma20 = last20.reduce((a,b)=>a+b,0)/20;
      const stdDev = Math.sqrt(last20.reduce((sum, val) => sum + Math.pow(val - sma20, 2), 0) / 20);
      const upperBand = sma20 + (2 * stdDev);
      const lowerBand = sma20 - (2 * stdDev);
      // BB Width is the width of the bands relative to the middle band (as a ratio)
      this.bbWidth = (upperBand - lowerBand) / sma20;
    }
    
    // Calculate Average True Range (ATR-14)
    if(this.closes.length >= 2 && this.highs.length >= 14 && this.lows.length >= 14) {
      // Calculate True Range series for the last 14 periods
      const trValues = [];
      for(let i = 1; i < 15; i++) {
        const idx = this.closes.length - i;
        const prevIdx = idx - 1;
        if(prevIdx < 0) break;
        
        // True Range is the greatest of:
        // 1. Current high - current low
        // 2. Abs(current high - previous close)
        // 3. Abs(current low - previous close)
        const tr = Math.max(
          this.highs[idx] - this.lows[idx],
          Math.abs(this.highs[idx] - this.closes[prevIdx]),
          Math.abs(this.lows[idx] - this.closes[prevIdx])
        );
        trValues.push(tr);
      }
      
      // ATR is the average of the TR values
      this.atr14 = trValues.reduce((a,b)=>a+b,0) / trValues.length;
    }
    
    // Calculate Average Directional Index (ADX-14)
    if(this.closes.length >= 15 && this.highs.length >= 15 && this.lows.length >= 15) {
      // Arrays to store +DM, -DM, and TR values
      const plusDM = [];
      const minusDM = [];
      const trValues = [];
      
      // Calculate +DM, -DM, and TR for each period
      for(let i = 1; i < 15; i++) {
        const idx = this.closes.length - i;
        const prevIdx = idx - 1;
        if(prevIdx < 0) break;
        
        // Calculate directional movement
        const highDiff = this.highs[idx] - this.highs[prevIdx];
        const lowDiff = this.lows[prevIdx] - this.lows[idx];
        
        // +DM and -DM calculations
        let plusDMValue = 0;
        let minusDMValue = 0;
        
        if(highDiff > lowDiff && highDiff > 0) {
          plusDMValue = highDiff;
        }
        
        if(lowDiff > highDiff && lowDiff > 0) {
          minusDMValue = lowDiff;
        }
        
        plusDM.push(plusDMValue);
        minusDM.push(minusDMValue);
        
        // True Range calculation
        const tr = Math.max(
          this.highs[idx] - this.lows[idx],
          Math.abs(this.highs[idx] - this.closes[prevIdx]),
          Math.abs(this.lows[idx] - this.closes[prevIdx])
        );
        trValues.push(tr);
      }
      
      // Calculate average TR, +DI, and -DI
      const atr = trValues.reduce((a,b)=>a+b,0) / 14;
      const plusDI = (plusDM.reduce((a,b)=>a+b,0) / atr) * 100 / 14;
      const minusDI = (minusDM.reduce((a,b)=>a+b,0) / atr) * 100 / 14;
      
      // Calculate DX (Directional Index)
      const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
      
      // Simplified ADX calculation (normally would use a smoothed average)
      this.adx14 = dx;
    }
  }
} 