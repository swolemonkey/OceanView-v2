import { parentPort, workerData } from 'worker_threads';

let lastPrice = 0;
let lastTs    = 0;
let equity = 10000;
let dayPnL = 0;

// fire a tiny order once on startup for connectivity test
parentPort!.postMessage({
  type:'order',
  symbol:'bitcoin',
  side:'buy',
  qty:0.0001,
  price:99999 // sentinel; SimExecution ignores price realism
});

// Report metrics every minute
setInterval(() => {
  parentPort?.postMessage({ 
    type: 'metric', 
    equity: equity, 
    pnl: dayPnL 
  });
}, 60000);

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
    const { order } = m.data;
    // Simple PnL tracking
    if (order && order.side === 'sell') {
      dayPnL += (order.price - lastPrice) * order.qty;
    }
  }
}); 