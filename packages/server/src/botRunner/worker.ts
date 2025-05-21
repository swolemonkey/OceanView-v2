import { parentPort, workerData } from 'worker_threads';

let lastPrice = 0;
let lastTs    = 0;

parentPort!.on('message', (m:any)=>{
  if(m.type==='tick'){
    const { prices, ts } = JSON.parse(m.data);
    const btc = prices.bitcoin?.usd;
    if(!btc){ return; }

    if(lastPrice && btc < lastPrice*0.997){  // drop >0.3 %
      parentPort!.postMessage({ type:'order',
        symbol:'bitcoin',
        side:'buy',
        qty:0.001,
        price:btc });
    }
    lastPrice = btc;
    lastTs    = ts;
  }
  if(m.type==='orderResult'){
    console.log(`[${workerData.name}] order result`, m.data);
  }
}); 