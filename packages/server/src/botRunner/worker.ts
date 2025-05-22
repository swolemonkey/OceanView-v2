import { parentPort, workerData } from 'worker_threads';
let mode = workerData.name;   // 'scalper' or 'hypertrades'

let lastPrice = 0;
let lastTs    = 0;

// fire a tiny order once on startup for connectivity test
parentPort!.postMessage({
  type:'order',
  symbol:'bitcoin',
  side:'buy',
  qty:0.0001,
  price:99999 // sentinel; SimExecution ignores price realism
});

parentPort!.on('message', (m:any)=>{
  if(m.type==='tick'){
    const { prices, ts } = JSON.parse(m.data);
    const btc = prices.bitcoin?.usd;
    if(!btc){ return; }

    if(mode==='hypertrades'){
      // Hypertrades bot logic now moved to its own worker file
      return;
    }

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