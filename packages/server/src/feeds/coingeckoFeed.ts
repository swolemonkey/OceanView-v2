import { DataFeed, Tick } from './interface.js';
// Dynamic import to avoid ESM issues during tests
const fetchFn = async (...args: any[]) => {
  const mod = await import('node-fetch');
  return (mod.default as any)(...args);
};
import * as pino from 'pino';

// Initialize logger
const logger = pino.pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

// Symbol mapping for CoinGecko
const SYMBOL_MAP: Record<string, string> = {
  // Standard symbol mappings
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'SOL': 'solana',
  'AVAX': 'avalanche-2',
  
  // Full name mappings for convenience
  'BITCOIN': 'bitcoin',
  'ETHEREUM': 'ethereum',
  'SOLANA': 'solana',
  'AVALANCHE': 'avalanche-2'
};

// Case-insensitive lookup function for symbol map
function getGeckoId(symbol: string): string | undefined {
  // Convert to uppercase for consistent key lookup in SYMBOL_MAP
  const upperSymbol = symbol.toUpperCase();
  
  // Look up the symbol in the map
  return SYMBOL_MAP[upperSymbol];
}

export class CoinGeckoFeed implements DataFeed {
  private url: string;
  private subscribers: Map<string, ((tick: Tick) => void)[]>;
  private pollInterval: NodeJS.Timeout | null;
  private rateLimited: boolean;
  private rateLimitResetTime: number;
  private cache: Record<string, number>;
  private lastPollTime: number;
  
  constructor(url?: string, pollIntervalMs = 30000) {
    this.url = url || process.env.COINGECKO_URL || 'https://api.coingecko.com/api/v3/simple/price';
    this.subscribers = new Map();
    this.pollInterval = null;
    this.rateLimited = false;
    this.rateLimitResetTime = 0;
    this.cache = {};
    this.lastPollTime = 0;
  }
  
  subscribe(symbol: string, cb: (tick: Tick) => void): void {
    const normalizedSymbol = symbol.toUpperCase();
    
    // Create array for this symbol if it doesn't exist
    if (!this.subscribers.has(normalizedSymbol)) {
      this.subscribers.set(normalizedSymbol, []);
    }
    
    // Add callback to subscribers
    this.subscribers.get(normalizedSymbol)?.push(cb);
    
    // Start polling if this is the first subscriber
    if (this.subscribers.size === 1 && !this.pollInterval) {
      this.startPolling();
    }
  }
  
  private startPolling(): void {
    // Poll immediately on first subscription
    this.pollPrices();
    
    // Set up regular polling
    this.pollInterval = setInterval(() => this.pollPrices(), 30000);
  }
  
  private async pollPrices(): Promise<void> {
    try {
      // Check if we're rate limited
      if (this.rateLimited) {
        const now = Date.now();
        if (now < this.rateLimitResetTime) {
          logger.warn(`CoinGecko rate limited, waiting until ${new Date(this.rateLimitResetTime).toISOString()}`);
          return;
        } else {
          // Reset rate limit flag after the cooldown period
          this.rateLimited = false;
        }
      }
      
      // Get all symbols we need to fetch
      const symbols = Array.from(this.subscribers.keys());
      if (symbols.length === 0) return;
      
      // Convert to CoinGecko IDs
      const geckoIds = symbols
        .map(s => getGeckoId(s))
        .filter(id => id !== undefined);
      
      if (geckoIds.length === 0) {
        logger.warn(`No valid CoinGecko IDs found for symbols: ${symbols.join(', ')}. Available mappings are: ${Object.keys(SYMBOL_MAP).join(', ')}`);
        return;
      }
      
      const qs = `ids=${geckoIds.join(',')}&vs_currencies=usd`;
      const fullUrl = `${this.url}?${qs}`;
      
      logger.info(`Fetching from CoinGecko: ${fullUrl}`);
      const res = await fetchFn(fullUrl);
      
      // Check for rate limiting
      if (res.status === 429) {
        logger.warn('CoinGecko rate limit exceeded!');
        this.rateLimited = true;
        // Set a 60 second cooldown before next attempt
        this.rateLimitResetTime = Date.now() + 60000;
        return;
      }
      
      if (!res.ok) {
        logger.error(`CoinGecko API error: ${res.status} ${res.statusText}`);
        return;
      }
      
      const data = await res.json() as Record<string, { usd: number }>;
      logger.info(`CoinGecko response: ${JSON.stringify(data)}`);
      
      // Process each price and notify subscribers
      const now = Date.now();
      this.lastPollTime = now;
      
      for (const symbol of symbols) {
        const geckoId = getGeckoId(symbol);
        if (!geckoId || !data[geckoId]) continue;
        
        const price = data[geckoId].usd;
        if (typeof price !== 'number') continue;
        
        // Cache the price
        this.cache[symbol] = price;
        
        // Create tick
        const tick: Tick = {
          symbol,
          price,
          timestamp: now
        };
        
        // Notify subscribers
        const callbacks = this.subscribers.get(symbol) || [];
        for (const cb of callbacks) {
          try {
            cb(tick);
          } catch (err) {
            logger.error(`Error in subscriber callback for ${symbol}: ${err}`);
          }
        }
      }
    } catch (err) {
      logger.error(`Error polling CoinGecko: ${err}`);
    }
  }
  
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
} 