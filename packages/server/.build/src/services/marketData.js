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
const endpoints = {
    coingecko: process.env.COINGECKO_URL || 'https://api.coingecko.com/api/v3/simple/price',
    coincap: process.env.COINCAP_URL || 'https://api.coincap.io/v2/assets',
};
// Modified to add more trading pairs
const SYMBOLS = ['bitcoin', 'ethereum', 'solana', 'avalanche-2'];
// Mapping of full symbol names to short symbols for internal use
const SYMBOL_MAP = {
    'bitcoin': 'BTC',
    'ethereum': 'ETH',
    'solana': 'SOL',
    'avalanche-2': 'AVAX'
};
// Simple in-memory cache
const cache = {
    data: null,
    timestamp: 0,
    isRateLimited: false,
    rateLimitResetTime: 0
};
async function fetchPrices(source) {
    try {
        // If we're rate limited, don't attempt another call until reset time
        if (source === 'coingecko' && cache.isRateLimited) {
            const now = Date.now();
            if (now < cache.rateLimitResetTime) {
                logger.warn(`CoinGecko rate limited, waiting until ${new Date(cache.rateLimitResetTime).toISOString()}`);
                throw new Error('Rate limited');
            }
            else {
                // Reset rate limit flag after the cooldown period
                cache.isRateLimited = false;
            }
        }
        const url = endpoints[source];
        if (!url) {
            logger.error(`URL for ${source} is undefined`);
            throw new Error(`Invalid URL for ${source}`);
        }
        if (source === 'coingecko') {
            const qs = `ids=${SYMBOLS.join(',')}&vs_currencies=usd`;
            const fullUrl = `${url}?${qs}`;
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
            // Add detailed logging of received data
            logger.info(`CoinGecko raw response data: ${JSON.stringify(data)}`);
            // Normalize CoinGecko data format if needed
            // This ensures consistent format for Bitcoin and Ethereum from different sources
            if (data && Object.keys(data).length > 0) {
                // Standard CoinGecko format is {bitcoin: {usd: 50000}, ethereum: {usd: 2500}}
                // Ensure this exact format for every supported symbol
                for (const symbol of SYMBOLS) {
                    if (data[symbol] && typeof data[symbol] === 'object') {
                        if (typeof data[symbol].usd !== 'number' && typeof data[symbol].USD === 'number') {
                            // Some versions capitalize USD - normalize it
                            data[symbol].usd = data[symbol].USD;
                            logger.info(`Normalized capitalized USD for ${symbol}`);
                        }
                    }
                }
            }
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
        if (source === 'coincap') {
            logger.info(`Fetching from ${source}: ${url}`);
            const res = await fetch(url);
            const json = await res.json();
            // Add detailed logging of received data
            logger.info(`CoinCap raw response data: ${JSON.stringify(json)}`);
            const map = {};
            json.data.forEach((d) => {
                if (SYMBOLS.includes(d.id)) {
                    map[d.id] = Number(d.priceUsd);
                    logger.info(`CoinCap processed ${d.id}: ${d.priceUsd} -> ${map[d.id]}`);
                }
            });
            // Create properly formatted data with nested usd property
            // This normalizes CoinCap to match CoinGecko's format
            const formattedData = Object.fromEntries(Object.entries(map).map(([k, v]) => [k, { usd: v }]));
            logger.info(`CoinCap formatted data: ${JSON.stringify(formattedData)}`);
            return formattedData;
        }
        return null;
    }
    catch (error) {
        logger.error({ err: error }, `Error fetching prices from ${source}`);
        throw error;
    }
}
export async function pollAndStore() {
    let data;
    // Use cached data if it's less than 60 seconds old
    const now = Date.now();
    const cacheAge = now - cache.timestamp;
    if (cache.data && cacheAge < 60000) {
        logger.info(`Using cached data from ${Math.floor(cacheAge / 1000)}s ago`);
        data = cache.data;
    }
    else {
        try {
            logger.info('Attempting to fetch from CoinGecko...');
            data = await fetchPrices('coingecko');
            logger.info(`CoinGecko data: ${JSON.stringify(data)}`);
            // Cache successful response
            if (data && Object.keys(data).length > 0) {
                cache.data = data;
                cache.timestamp = now;
            }
        }
        catch (error) {
            // If rate limited and we have cache, use the cache
            if (cache.isRateLimited && cache.data) {
                logger.info(`Rate limited, using cached data: ${JSON.stringify(cache.data)}`);
                data = cache.data;
            }
            else {
                logger.info('CoinGecko failed, falling back to CoinCap...');
                try {
                    data = await fetchPrices('coincap');
                    logger.info(`CoinCap data: ${JSON.stringify(data)}`);
                    // Cache successful response
                    if (data && Object.keys(data).length > 0) {
                        cache.data = data;
                        cache.timestamp = now;
                    }
                }
                catch (fallbackError) {
                    // If everything failed but we have somewhat recent cache, use it
                    if (cache.data && cacheAge < 300000) { // 5 minutes
                        logger.info(`Both APIs failed, using older cached data: ${JSON.stringify(cache.data)}`);
                        data = cache.data;
                    }
                    else {
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
    for (const id of SYMBOLS) {
        let price = data?.[id]?.usd;
        if (!price) {
            logger.warn(`No price data for ${id} in standard format: ${JSON.stringify(data)}`);
            // Debug info for tracking down the issue
            logger.info(`Data structure for ${id}: ${JSON.stringify(data[id])}`);
            // Try to find alternative price formats
            if (data[id]) {
                const keys = Object.keys(data[id]);
                logger.info(`All keys in data[${id}]: ${keys.join(', ')}`);
                // Try USD (uppercase) format
                if (data[id] && typeof data[id] === 'object' && 'USD' in data[id] && typeof data[id].USD === 'number') {
                    price = data[id].USD;
                    logger.info(`Found price in uppercase USD format: ${price}`);
                }
                // Try first available numeric property
                else if (keys.length > 0 && typeof data[id][keys[0]] === 'number') {
                    price = data[id][keys[0]];
                    logger.info(`Using first available numeric property ${keys[0]}: ${price}`);
                }
            }
            // Try direct numeric value
            else if (typeof data[id] === 'number') {
                price = data[id];
                logger.info(`Found direct numeric price for ${id}: ${price}`);
            }
            // If still no price, skip this symbol
            if (!price) {
                logger.warn(`No usable price data found for ${id}, skipping`);
                continue;
            }
        }
        logger.info(`Processing price for ${id}: ${price}`);
        // 1) push to redis stream (ticks:crypto)
        pipe.xadd('ticks:crypto', '*', 'symbol', id, 'price', price.toString());
        // 2) Store latest price in a hash for O(1) lookup
        pipe.hset('latest:crypto', id, price.toString());
        // 3) write 1-min candle stub → DB (merge later)
        // @ts-ignore - Working with mock Prisma client
        await prisma.price1m.upsert({
            where: { symbol_timestamp: { symbol: id, timestamp: ts } },
            update: { close: price },
            create: { symbol: id, timestamp: ts, open: price, high: price, low: price, close: price, volume: 0 }
        });
    }
    // DEBUG: Log Redis commands before executing
    logger.info(`Redis pipeline commands prepared for execution`);
    await pipe.exec();
    // publish compact JSON to WS channel
    const wsPayload = JSON.stringify({ ts, prices: data });
    logger.info(`Publishing to WebSocket channel: ${wsPayload}`);
    redis.publish('chan:ticks', wsPayload);
}
/**
 * Gets the latest prices for all supported symbols
 * @returns A record of symbol to price mapping
 */
export async function getLatestPrices() {
    try {
        // First try to get prices from Redis
        const latestPrices = await redis.hgetall('latest:crypto');
        if (latestPrices && Object.keys(latestPrices).length > 0) {
            // Convert Redis strings to numbers and map to short symbol names
            const prices = {};
            for (const [symbol, priceStr] of Object.entries(latestPrices)) {
                const shortSymbol = SYMBOL_MAP[symbol] || symbol.toUpperCase();
                // Handle the unknown type properly by ensuring priceStr is a string
                prices[shortSymbol] = parseFloat(String(priceStr));
            }
            logger.info(`Retrieved latest prices from Redis: ${JSON.stringify(prices)}`);
            return prices;
        }
        // If no Redis data, try to get from cache
        if (cache.data) {
            const prices = {};
            for (const symbol of SYMBOLS) {
                const price = cache.data[symbol]?.usd;
                if (price !== undefined) {
                    const shortSymbol = SYMBOL_MAP[symbol] || symbol.toUpperCase();
                    prices[shortSymbol] = price;
                }
            }
            if (Object.keys(prices).length > 0) {
                logger.info(`Using cached price data: ${JSON.stringify(prices)}`);
                return prices;
            }
        }
        // If no data from cache, poll the APIs
        await pollAndStore();
        // Now try Redis again
        const refreshedPrices = await redis.hgetall('latest:crypto');
        if (refreshedPrices && Object.keys(refreshedPrices).length > 0) {
            // Convert Redis strings to numbers and map to short symbol names
            const prices = {};
            for (const [symbol, priceStr] of Object.entries(refreshedPrices)) {
                const shortSymbol = SYMBOL_MAP[symbol] || symbol.toUpperCase();
                // Handle the unknown type properly by ensuring priceStr is a string
                prices[shortSymbol] = parseFloat(String(priceStr));
            }
            logger.info(`Retrieved refreshed prices from Redis: ${JSON.stringify(prices)}`);
            return prices;
        }
        logger.warn('Failed to get latest prices');
        return null;
    }
    catch (error) {
        logger.error('Error getting latest prices:', error);
        return null;
    }
}
// Handle graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await redis.quit();
    // prisma is a mock object without $disconnect
    logger.info('Graceful shutdown completed');
    process.exit(0);
});
