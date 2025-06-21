import { ExecutionEngine, Order, Fill } from './interface.js';
import fetch from 'node-fetch';
import * as pino from 'pino';
import { prisma } from '../db.js';

// Initialize logger
const logger = pino.pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

export class AlpacaPaperEngine implements ExecutionEngine {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private botId?: number;
  
  constructor(apiKey?: string, apiSecret?: string, botId?: number) {
    this.apiKey = apiKey || process.env.ALPACA_API_KEY || '';
    this.apiSecret = apiSecret || process.env.ALPACA_API_SECRET || '';
    this.baseUrl = 'https://paper-api.alpaca.markets';
    this.botId = botId;
    
    if (!this.apiKey || !this.apiSecret) {
      logger.warn('Alpaca API credentials not provided! Using demo mode with limited functionality.');
    }
  }

  /**
   * Validate and normalize symbol format for Alpaca
   * Alpaca uses standard stock symbols (e.g., AAPL, TSLA)
   * and crypto symbols with /USD suffix (e.g., BTC/USD, ETH/USD)
   */
  private validateAndNormalizeSymbol(symbol: string): { isValid: boolean; normalizedSymbol: string; error?: string } {
    if (!symbol || typeof symbol !== 'string') {
      return { isValid: false, normalizedSymbol: symbol, error: 'Symbol must be a non-empty string' };
    }

    // Clean up the symbol
    const cleanSymbol = symbol.toUpperCase().trim();
    
    // Check for empty symbol
    if (!cleanSymbol) {
      return { isValid: false, normalizedSymbol: symbol, error: 'Symbol cannot be empty' };
    }

    // Check for invalid characters
    if (!/^[A-Z0-9\/\-_\.]+$/.test(cleanSymbol)) {
      return { isValid: false, normalizedSymbol: symbol, error: 'Symbol contains invalid characters' };
    }

    // Handle crypto symbols from other exchanges (convert to Alpaca format)
    if (cleanSymbol.startsWith('X_') && cleanSymbol.endsWith('USD')) {
      // Convert X_BTCUSD to BTC/USD format
      const cryptoBase = cleanSymbol.substring(2, cleanSymbol.length - 3);
      const normalizedSymbol = `${cryptoBase}/USD`;
      
      logger.info(`🔄 SYMBOL CONVERSION: ${symbol} -> ${normalizedSymbol}`, {
        original: symbol,
        normalized: normalizedSymbol,
        exchange: 'alpaca'
      });
      
      return { isValid: true, normalizedSymbol };
    }

    // Handle standard stock symbols
    if (/^[A-Z]{1,5}$/.test(cleanSymbol)) {
      return { isValid: true, normalizedSymbol: cleanSymbol };
    }

    // Handle crypto symbols in correct format
    if (/^[A-Z]+\/USD$/.test(cleanSymbol)) {
      return { isValid: true, normalizedSymbol: cleanSymbol };
    }

    // Handle other formats (add validation as needed)
    if (cleanSymbol.length > 15) {
      return { isValid: false, normalizedSymbol: symbol, error: 'Symbol too long (max 15 characters)' };
    }

    // Default to accepting the symbol but log a warning
    logger.warn(`⚠️ SYMBOL WARNING: Unrecognized symbol format: ${cleanSymbol}`, {
      symbol: cleanSymbol,
      exchange: 'alpaca'
    });
    
    return { isValid: true, normalizedSymbol: cleanSymbol };
  }
  
  async place(order: Order): Promise<Fill> {
    try {
      // ========================================
      // 🔍 SYMBOL VALIDATION & NORMALIZATION
      // ========================================
      const symbolValidation = this.validateAndNormalizeSymbol(order.symbol);
      if (!symbolValidation.isValid) {
        const error = new Error(`Invalid symbol: ${symbolValidation.error}`);
        logger.error(`❌ SYMBOL VALIDATION FAILED: ${order.symbol}`, {
          symbol: order.symbol,
          error: symbolValidation.error,
          exchange: 'alpaca'
        });
        throw error;
      }

      const normalizedSymbol = symbolValidation.normalizedSymbol;
      logger.info(`Placing ${order.side} order for ${order.qty} ${normalizedSymbol} @ $${order.price}`, {
        originalSymbol: order.symbol,
        normalizedSymbol: normalizedSymbol,
        symbolConverted: order.symbol !== normalizedSymbol
      });
      
      // Create order in local DB first (using normalized symbol)
      const dbOrder = await prisma.order.create({
        data: {
          symbol: normalizedSymbol, // Use normalized symbol
          side: order.side,
          qty: order.qty,
          price: order.price,
          type: order.type || 'market',
          botId: this.botId
        }
      });
      
      // Prepare request to Alpaca API
      const requestUrl = `${this.baseUrl}/v2/orders`;
      const requestBody = {
        symbol: normalizedSymbol, // Use normalized symbol for API request
        qty: order.qty.toString(),
        side: order.side,
        type: order.type || 'market',
        time_in_force: order.timeInForce || 'day'
      };
      
      // Add limit/stop prices if provided
      if (order.type === 'limit' && order.limitPrice) {
        Object.assign(requestBody, { limit_price: order.limitPrice.toString() });
      }
      
      if (order.stopPrice) {
        Object.assign(requestBody, { stop_price: order.stopPrice.toString() });
      }
      
      // Send request to Alpaca
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'APCA-API-KEY-ID': this.apiKey,
          'APCA-API-SECRET-KEY': this.apiSecret,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Alpaca API error: ${response.status} ${response.statusText} - ${errorText}`);
        
        // Fallback to simulation if API fails
        return this.fallbackToSimulation(order, dbOrder.id);
      }
      
      const alpacaOrder = await response.json() as any;
      logger.info(`Alpaca order placed: ${alpacaOrder.id}`);
      
      // Wait for the order to be filled (poll status)
      const fill = await this.waitForFill(alpacaOrder.id, order);
      
      // Record the fill in our database
      const trade = await prisma.trade.create({
        data: {
          orderId: dbOrder.id,
          symbol: fill.symbol,
          side: fill.side,
          qty: fill.qty,
          price: fill.price,
          feePaid: fill.fee,
          pnl: 0,
          botId: this.botId,
          externalId: fill.id
        }
      });
      
      // Update the fill with our database ID
      fill.id = trade.id.toString();
      fill.orderId = dbOrder.id.toString();
      
      return fill;
    } catch (error) {
      logger.error(`Error placing order with Alpaca: ${String(error)}`);
      
      // Fall back to simulation
      return this.fallbackToSimulation(order);
    }
  }
  
  private async waitForFill(alpacaOrderId: string, originalOrder: Order, maxAttempts = 10): Promise<Fill> {
    // Poll for order status
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Wait between polls (increasing delay for backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(1.5, attempt)));
        
        // Get order status
        const orderUrl = `${this.baseUrl}/v2/orders/${alpacaOrderId}`;
        const response = await fetch(orderUrl, {
          headers: {
            'APCA-API-KEY-ID': this.apiKey,
            'APCA-API-SECRET-KEY': this.apiSecret
          }
        });
        
        if (!response.ok) {
          logger.error(`Error checking order status: ${response.status} ${response.statusText}`);
          continue;
        }
        
        const order = await response.json() as any;
        
        // Check if order is filled
        if (order.status === 'filled') {
          logger.info(`Order ${alpacaOrderId} filled: ${order.filled_qty} @ $${order.filled_avg_price}`);
          
          // Create fill object
          const fill: Fill = {
            id: alpacaOrderId,
            symbol: order.symbol,
            side: order.side as 'buy' | 'sell',
            qty: parseFloat(order.filled_qty),
            price: parseFloat(order.filled_avg_price),
            fee: parseFloat(order.filled_qty) * parseFloat(order.filled_avg_price) * 0.0004, // Estimate fee
            timestamp: new Date(order.filled_at || Date.now()).getTime()
          };
          
          return fill;
        }
        
        // If order is rejected, canceled, or expired, fall back to simulation
        if (['rejected', 'canceled', 'expired'].includes(order.status)) {
          logger.warn(`Order ${alpacaOrderId} ${order.status}: ${order.rejected_reason || 'unknown reason'}`);
          break;
        }
        
        logger.info(`Order ${alpacaOrderId} status: ${order.status}, waiting...`);
      } catch (error) {
        logger.error(`Error polling order status: ${String(error)}`);
      }
    }
    
    // If we get here, order wasn't filled after max attempts or was rejected
    logger.warn(`Order ${alpacaOrderId} not filled after ${maxAttempts} attempts, falling back to simulation`);
    return this.fallbackToSimulation(originalOrder);
  }
  
  private async fallbackToSimulation(order: Order, orderId?: number): Promise<Fill> {
    logger.info(`Falling back to simulation for ${order.side} ${order.qty} ${order.symbol}`);
    
    // Look up wallet equity
    const bot = await prisma.bot.findUnique({ where: { id: this.botId } });
    const equity = bot?.equity ?? 10_000;
    
    // Calculate slippage
    const impact = (order.qty * order.price) / equity * 0.0015; // 0.15%
    const fillPrice = order.side === 'buy' ? order.price * (1 + impact) : order.price * (1 - impact);
    
    // Calculate fee
    const fee = fillPrice * order.qty * 0.0004;
    
    // Create order in DB if it doesn't exist
    let dbOrderId = orderId;
    if (!dbOrderId) {
      const dbOrder = await prisma.order.create({
        data: {
          symbol: order.symbol,
          side: order.side,
          qty: order.qty,
          price: order.price,
          type: order.type || 'market',
          botId: this.botId
        }
      });
      dbOrderId = dbOrder.id;
    }
    
    // Make sure dbOrderId is defined
    if (!dbOrderId) {
      throw new Error('Failed to create or retrieve order ID');
    }
    
    // Create trade with fill price and fee
    const trade = await prisma.trade.create({
      data: {
        orderId: dbOrderId,
        symbol: order.symbol,
        side: order.side,
        qty: order.qty,
        price: fillPrice,
        feePaid: fee,
        pnl: 0,
        botId: this.botId,
        externalId: `sim-${Date.now()}`
      }
    });
    
    // Return fill information
    const fill: Fill = {
      id: trade.id.toString(),
      symbol: order.symbol,
      side: order.side,
      qty: order.qty,
      price: fillPrice,
      fee,
      timestamp: Date.now(),
      orderId: dbOrderId.toString()
    };
    
    return fill;
  }
} 