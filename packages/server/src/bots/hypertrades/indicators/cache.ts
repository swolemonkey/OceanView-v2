export class IndicatorCache {
  private closes:number[]=[];
  rsi14=50; fastMA=0; slowMA=0;
  updateOnClose(close:number){
    this.closes.push(close);
    if(this.closes.length>200) this.closes.shift();
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
  }
} 