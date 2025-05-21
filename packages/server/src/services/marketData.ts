import fetch from 'node-fetch';
// Import only the default function from ioredis-mock
import IoRedisMock from 'ioredis-mock';
import pino from 'pino';
import { prisma } from '../db.js';

// Initialize logger
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

// Use Redis mock for development
// @ts-ignore - Working around type issues with ioredis-mock
const redis = new IoRedisMock();

type Source = 'coingecko' | 'coincap';
const endpoints: Record<Source,string> = {
  coingecko: process.env.COINGECKO_URL || 'https://api.coingecko.com/api/v3/simple/price',
  coincap:   process.env.COINCAP_URL || 'https://api.coincap.io/v2/assets',
};

const SYMBOLS = ['bitcoin','ethereum'];   // start small; expand later

// Simple in-memory cache
const cache = {
  data: null as any,
  timestamp: 0,
  isRateLimited: false,
  rateLimitResetTime: 0
};

async function fetchPrices(source: Source){
  try {
    // If we're rate limited, don't attempt another call until reset time
    if (source === 'coingecko' && cache.isRateLimited) {
      const now = Date.now();
      if (now < cache.rateLimitResetTime) {
        logger.warn(`CoinGecko rate limited, waiting until ${new Date(cache.rateLimitResetTime).toISOString()}`);
        throw new Error('Rate limited');
      } else {
        // Reset rate limit flag after the cooldown period
        cache.isRateLimited = false;
      }
    }

    const url = endpoints[source];
    if (!url) {
      logger.error(`URL for ${source} is undefined`);
      throw new Error(`Invalid URL for ${source}`);
    }
    
    if(source==='coingecko'){
      const qs = SYMBOLS.map(s=>`ids=${s}`).join('&');
      const fullUrl = `${url}?${qs}&vs_currencies=usd`;
      logger.info(`Fetching from ${source}: ${fullUrl}`);
      const res = await fetch(fullUrl);
      
      // Check for rate limiting
      if (res.status === 429) {
        logger.warn('CoinGecko rate limit exceeded!');
        cache.isRateLimited = true;
        // Set a 60 second cooldown before next attempt
        cache.rateLimitResetTime = Date.now() + 60000;
        throw new Error('Rate limited');
      }
      
      const data = await res.json();
      
      // Detect rate limit error in the response (CoinGecko sometimes returns 200 with error body)
      // @ts-ignore - CoinGecko API can return a status object with an error_code
      if (data?.status?.error_code === 429) {
        logger.warn('CoinGecko rate limit exceeded (from response body)!');
        cache.isRateLimited = true;
        // Set a 60 second cooldown before next attempt
        cache.rateLimitResetTime = Date.now() + 60000;
        throw new Error('Rate limited');
      }
      
      return data;
    }
    if(source==='coincap'){
      logger.info(`Fetching from ${source}: ${url}`);
      const res = await fetch(url);
      const json:any = await res.json();
      const map:Record<string,number> = {};
      json.data.forEach((d:any)=>{
        if(SYMBOLS.includes(d.id)) map[d.id]=Number(d.priceUsd);
      });
      return Object.fromEntries(
        Object.entries(map).map(([k,v])=>[k,{usd:v}])
      );
    }
    return null;
  } catch (error) {
    logger.error({err: error}, `Error fetching prices from ${source}`);
    throw error;
  }
}

export async function pollAndStore(){
  let data:any;
  
  // Use cached data if it's less than 60 seconds old
  const now = Date.now();
  const cacheAge = now - cache.timestamp;
  if (cache.data && cacheAge < 60000) {
    logger.info(`Using cached data from ${Math.floor(cacheAge/1000)}s ago`);
    data = cache.data;
  } else {
    try { 
      logger.info('Attempting to fetch from CoinGecko...');
      data = await fetchPrices('coingecko'); 
      logger.info('CoinGecko data:', data);
      
      // Cache successful response
      if (data && Object.keys(data).length > 0) {
        cache.data = data;
        cache.timestamp = now;
      }
    }
    catch(error){ 
      // If rate limited and we have cache, use the cache
      if (cache.isRateLimited && cache.data) {
        logger.info('Rate limited, using cached data');
        data = cache.data;
      } else {
        logger.info('CoinGecko failed, falling back to CoinCap...');
        try {
          data = await fetchPrices('coincap'); 
          logger.info('CoinCap data:', data);
          
          // Cache successful response
          if (data && Object.keys(data).length > 0) {
            cache.data = data;
            cache.timestamp = now;
          }
        } catch (fallbackError) {
          // If everything failed but we have somewhat recent cache, use it
          if (cache.data && cacheAge < 300000) { // 5 minutes
            logger.info('Both APIs failed, using older cached data');
            data = cache.data;
          } else {
            logger.error('Both data sources failed and no valid cache available');
            return; // Exit early if both sources fail and no cache
          }
        }
      }
    }
  }

  if (!data) {
    logger.warn('No data received from API sources or cache');
    return;
  }

  const ts = new Date();
  // Normalize timestamp to minute start by setting seconds and milliseconds to 0
  ts.setSeconds(0, 0);
  
  const pipe = redis.pipeline();
  for(const id of SYMBOLS){
    const price = data?.[id]?.usd;
    if(!price) {
      logger.warn(`No price data for ${id} in response:`, data);
      continue;
    }
    
    logger.info(`Processing price for ${id}: ${price}`);
    
    // 1) push to redis stream (ticks:crypto)
    pipe.xadd('ticks:crypto','*','symbol',id,'price',price);
    // 2) Store latest price in a hash for O(1) lookup
    pipe.hset('latest:crypto', id, price.toString());
    // 3) write 1-min candle stub → DB (merge later)
    // @ts-ignore - Working with mock Prisma client
    await prisma.price1m.upsert({
      where:{ symbol_timestamp:{symbol:id,timestamp:ts}},
      update:{ close: price },
      create:{ symbol:id, timestamp:ts, open:price, high:price, low:price, close:price, volume:0 }
    });
  }
  await pipe.exec();
  
  // publish compact JSON to WS channel
  const wsPayload = JSON.stringify({ ts, prices: data });
  logger.info(`Publishing to WebSocket channel: ${wsPayload}`);
  redis.publish('chan:ticks', wsPayload);
} 

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await redis.quit();
  // prisma is a mock object without $disconnect
  logger.info('Graceful shutdown completed');
  process.exit(0);
}); 