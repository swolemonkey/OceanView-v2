import fetch from 'node-fetch';
import Redis from 'ioredis';
import { prisma } from '../db.js';

const redis = new Redis(process.env.REDIS_URL!);

type Source = 'coingecko' | 'coincap';
const endpoints: Record<Source,string> = {
  coingecko: process.env.COINGECKO_URL!,
  coincap:   process.env.COINCAP_URL!,
};

const SYMBOLS = ['bitcoin','ethereum'];   // start small; expand later

async function fetchPrices(source: Source){
  if(source==='coingecko'){
    const qs = SYMBOLS.map(s=>`${s}=usd`).join('&');
    const res = await fetch(`${endpoints.coingecko}?ids=${qs}&vs_currencies=usd`);
    return await res.json();              // { bitcoin:{usd:...}, … }
  }
  if(source==='coincap'){
    const res = await fetch(`${endpoints.coincap}`);
    const json:any = await res.json();
    const map:Record<string,number> = {};
    json.data.forEach((d:any)=>{
      if(SYMBOLS.includes(d.id)) map[d.id]=Number(d.priceUsd);
    });
    return Object.fromEntries(
      Object.entries(map).map(([k,v])=>[k,{usd:v}])
    );
  }
}

export async function pollAndStore(){
  let data:any;
  try { data = await fetchPrices('coingecko'); }
  catch{ data = await fetchPrices('coincap'); }

  const ts = new Date();
  const pipe = redis.pipeline();
  for(const id of SYMBOLS){
    const price = data?.[id]?.usd;
    if(!price) continue;
    // 1) push to redis stream (ticks:crypto)
    pipe.xadd('ticks:crypto','*','symbol',id,'price',price);
    // 2) write 1-min candle stub → DB (merge later)
    await prisma.price1m.upsert({
      where:{ symbol_timestamp:{symbol:id,timestamp:ts}},
      update:{ close: price },
      create:{ symbol:id, timestamp:ts, open:price, high:price, low:price, close:price, volume:0 }
    });
  }
  await pipe.exec();
} 