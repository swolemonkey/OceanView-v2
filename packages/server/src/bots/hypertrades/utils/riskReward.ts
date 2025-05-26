export function passRR(side:'buy'|'sell', entry:number, stop:number, target:number, minRR=2){
  const rr=Math.abs((target-entry)/(entry-stop));
  return rr>=minRR;
} 