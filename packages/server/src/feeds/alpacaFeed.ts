import { DataFeed, Tick } from './interface.js';
import * as pino from 'pino';
import WebSocket from 'ws';
import fetch from 'node-fetch';

// Initialize logger
const logger = pino.pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

// Add type declaration for WebSocket messages
interface AlpacaMessage {
  stream: string;
  data: {
    status?: string;
    event?: string;
    S?: string; // Symbol
    p?: string; // Price
    t?: string; // Timestamp
    s?: string; // Size/Volume
    bp?: string; // Bid price
    ap?: string; // Ask price
  };
}

export class AlpacaFeed implements DataFeed {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private dataUrl: string; // Add separate data URL
  private websocket: WebSocket | null;
  private subscribers: Map<string, ((tick: Tick) => void)[]>;
  private connected: boolean;
  private subscribedSymbols: Set<string>;
  private restFallbackInterval: NodeJS.Timeout | null;
  private cache: Record<string, Tick>;
  
  constructor(apiKey?: string, apiSecret?: string, isPaper = true) {
    this.apiKey = apiKey || process.env.ALPACA_API_KEY || '';
    this.apiSecret = apiSecret || process.env.ALPACA_API_SECRET || '';
    this.baseUrl = isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
    this.dataUrl = 'https://data.alpaca.markets'; // Data API has its own URL
    this.websocket = null;
    this.subscribers = new Map();
    this.connected = false;
    this.subscribedSymbols = new Set();
    this.restFallbackInterval = null;
    this.cache = {};
    
    if (!this.apiKey || !this.apiSecret) {
      logger.warn('Alpaca API credentials not provided! Using demo mode with limited functionality.');
    }
  }
  
  subscribe(symbol: string, cb: (tick: Tick) => void): void {
    const normalizedSymbol = symbol.toUpperCase();
    
    // Create array for this symbol if it doesn't exist
    if (!this.subscribers.has(normalizedSymbol)) {
      this.subscribers.set(normalizedSymbol, []);
    }
    
    // Add callback to subscribers
    this.subscribers.get(normalizedSymbol)?.push(cb);
    
    // Connect to websocket if this is the first subscriber
    if (!this.connected) {
      this.connectWebSocket();
    }
    
    // Subscribe to the symbol via websocket if connected
    if (this.connected && this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.subscribeToSymbol(normalizedSymbol);
    } else {
      // Add to pending subscriptions
      this.subscribedSymbols.add(normalizedSymbol);
    }
    
    // Set up REST fallback if it's not already running
    if (!this.restFallbackInterval) {
      this.startRestFallback();
    }
  }
  
  private connectWebSocket(): void {
    const wsUrl = this.baseUrl.replace('https://', 'wss://') + '/stream';
    
    logger.info(`Connecting to Alpaca WebSocket: ${wsUrl}`);
    this.websocket = new WebSocket(wsUrl);
    
    this.websocket.on('open', () => {
      logger.info('Alpaca WebSocket connected');
      this.connected = true;
      
      // Authenticate
      this.websocket?.send(JSON.stringify({
        action: 'auth',
        key: this.apiKey,
        secret: this.apiSecret
      }));
      
      // Subscribe to all pending symbols
      for (const symbol of this.subscribedSymbols) {
        this.subscribeToSymbol(symbol);
      }
    });
    
    this.websocket.on('message', (data: WebSocket.Data) => {
      try {
        const messages = JSON.parse(data.toString()) as AlpacaMessage | AlpacaMessage[];
        
        // Handle different message types
        for (const msg of Array.isArray(messages) ? messages : [messages]) {
          if (msg.stream === 'authorization' && msg.data.status === 'authorized') {
            logger.info('Alpaca WebSocket authenticated successfully');
          } else if (msg.stream === 'trade_updates' && msg.data.event === 'fill') {
            // Handle trade updates (fill events)
            logger.info(`Alpaca trade update: ${JSON.stringify(msg.data)}`);
          } else if (msg.stream === 'trades' || msg.stream === 'quotes') {
            // Handle market data
            const data = msg.data;
            if (!data || !data.S) continue; // S is the symbol
            
            const symbol = data.S;
            // For trade updates (T = trades, Q = quotes)
            if (msg.stream === 'trades' && data.p) {
              const tick: Tick = {
                symbol,
                price: parseFloat(data.p),
                timestamp: new Date(data.t || Date.now().toString()).getTime(),
                volume: parseFloat(data.s || '0')
              };
              
              // Update cache
              this.cache[symbol] = tick;
              
              // Notify subscribers
              const callbacks = this.subscribers.get(symbol) || [];
              for (const cb of callbacks) {
                try {
                  cb(tick);
                } catch (err) {
                  logger.error(`Error in subscriber callback for ${symbol}: ${String(err)}`);
                }
              }
            } else if (msg.stream === 'quotes' && data.bp && data.ap) {
              // For quote updates, we create a tick with bid/ask info
              const tick: Tick = {
                symbol,
                // Use midpoint as the price
                price: (parseFloat(data.bp) + parseFloat(data.ap)) / 2,
                timestamp: new Date(data.t || Date.now().toString()).getTime(),
                bid: parseFloat(data.bp),
                ask: parseFloat(data.ap)
              };
              
              // Only update cache if we don't have a trade price
              if (!this.cache[symbol] || !this.cache[symbol].volume) {
                this.cache[symbol] = tick;
              }
              
              // Notify subscribers
              const callbacks = this.subscribers.get(symbol) || [];
              for (const cb of callbacks) {
                try {
                  cb(tick);
                } catch (err) {
                  logger.error(`Error in subscriber callback for ${symbol}: ${String(err)}`);
                }
              }
            }
          }
        }
      } catch (err) {
        logger.error(`Error parsing Alpaca WebSocket message: ${String(err)}`);
      }
    });
    
    this.websocket.on('error', (err: Error) => {
      logger.error(`Alpaca WebSocket error: ${err.message}`);
      this.connected = false;
    });
    
    this.websocket.on('close', () => {
      logger.info('Alpaca WebSocket disconnected');
      this.connected = false;
      
      // Reconnect after a delay
      setTimeout(() => {
        if (this.subscribers.size > 0) {
          this.connectWebSocket();
        }
      }, 5000);
    });
  }
  
  private subscribeToSymbol(symbol: string): void {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      this.subscribedSymbols.add(symbol);
      return;
    }
    
    // Add to subscribed symbols set
    this.subscribedSymbols.add(symbol);
    
    // Send subscription message
    this.websocket.send(JSON.stringify({
      action: 'subscribe',
      trades: [symbol],
      quotes: [symbol]
    }));
    
    logger.info(`Subscribed to Alpaca WebSocket for ${symbol}`);
  }
  
  private startRestFallback(): void {
    // Immediately fetch prices once
    this.fetchPricesViaREST();
    
    // Set up regular polling (every 60 seconds as per requirements)
    this.restFallbackInterval = setInterval(() => this.fetchPricesViaREST(), 60000);
  }
  
  private async fetchPricesViaREST(): Promise<void> {
    try {
      const symbols = Array.from(this.subscribers.keys());
      if (symbols.length === 0) return;
      
      // Get latest trades using the data API URL
      const tradesUrl = `${this.dataUrl}/v2/stocks/trades/latest?symbols=${symbols.join(',')}`;
      
      logger.info(`Fetching from Alpaca REST API: ${tradesUrl}`);
      const res = await fetch(tradesUrl, {
        headers: {
          'APCA-API-KEY-ID': this.apiKey,
          'APCA-API-SECRET-KEY': this.apiSecret
        }
      });
      
      if (!res.ok) {
        logger.error(`Alpaca API error: ${res.status} ${res.statusText}`);
        return;
      }
      
      // Define the type for Alpaca trade response
      interface AlpacaTradeResponse {
        trades: {
          [symbol: string]: {
            p: number; // price
            t: string; // timestamp
            s?: number; // size/volume
          }
        }
      }
      
      const data = await res.json() as AlpacaTradeResponse;
      logger.info(`Alpaca trades response: ${JSON.stringify(data)}`);
      
      // Process the data - note the response has a 'trades' object containing symbols
      if (data.trades) {
        for (const symbol in data.trades) {
          const trade = data.trades[symbol];
          if (trade && trade.p) {
            const tick: Tick = {
              symbol,
              price: trade.p,
              timestamp: new Date(trade.t).getTime(),
              volume: trade.s || 0
            };
            
            // Update cache
            this.cache[symbol] = tick;
            
            // Notify subscribers
            const callbacks = this.subscribers.get(symbol) || [];
            for (const cb of callbacks) {
              try {
                cb(tick);
              } catch (err) {
                logger.error(`Error in subscriber callback for ${symbol}: ${String(err)}`);
              }
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Error fetching Alpaca REST data: ${String(error)}`);
    }
  }
  
  stop(): void {
    // Close websocket
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    
    // Clear fallback interval
    if (this.restFallbackInterval) {
      clearInterval(this.restFallbackInterval);
      this.restFallbackInterval = null;
    }
    
    // Reset state
    this.connected = false;
    this.subscribedSymbols.clear();
  }
} 