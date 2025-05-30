import { ExecutionEngine, Order, Fill } from './interface.js';
import fetch from 'node-fetch';
import * as pino from 'pino';
import { prisma } from '../db.js';
import crypto from 'crypto';

// Initialize logger
const logger = pino.pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

export class BinanceTestnetEngine implements ExecutionEngine {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private botId?: number;
  
  constructor(apiKey?: string, apiSecret?: string, botId?: number) {
    this.apiKey = apiKey || process.env.BINANCE_TESTNET_API_KEY || '';
    this.apiSecret = apiSecret || process.env.BINANCE_TESTNET_API_SECRET || '';
    this.baseUrl = 'https://testnet.binance.vision/api';
    this.botId = botId;
    
    if (!this.apiKey || !this.apiSecret) {
      logger.warn('Binance Testnet API credentials not provided! Using demo mode with limited functionality.');
    }
  }
  
  async place(order: Order): Promise<Fill> {
    try {
      logger.info(`Placing ${order.side} order for ${order.qty} ${order.symbol} @ $${order.price}`);
      
      // Create order in local DB first
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
      
      // Prepare parameters for Binance API
      const timestamp = Date.now();
      const queryParams = new URLSearchParams({
        symbol: order.symbol.replace('/', ''), // Remove slash if present (BTC/USDT -> BTCUSDT)
        side: order.side.toUpperCase(),
        type: (order.type || 'MARKET').toUpperCase(),
        quantity: order.qty.toString(),
        timestamp: timestamp.toString()
      });
      
      // Add limit price if provided
      if (order.type === 'limit' && order.limitPrice) {
        queryParams.append('price', order.limitPrice.toString());
        queryParams.append('timeInForce', (order.timeInForce || 'GTC').toUpperCase());
      }
      
      // Generate signature for Binance API
      const signature = crypto
        .createHmac('sha256', this.apiSecret)
        .update(queryParams.toString())
        .digest('hex');
      
      queryParams.append('signature', signature);
      
      // Send request to Binance Testnet
      const requestUrl = `${this.baseUrl}/v3/order?${queryParams.toString()}`;
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': this.apiKey
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Binance API error: ${response.status} ${response.statusText} - ${errorText}`);
        
        // Fallback to simulation if API fails
        return this.fallbackToSimulation(order, dbOrder.id);
      }
      
      const binanceResponse = await response.json() as any;
      logger.info(`Binance order placed: ${binanceResponse.orderId}`);
      
      // For market orders, Binance returns filled info immediately
      if (binanceResponse.status === 'FILLED') {
        // Calculate average fill price
        let totalQty = 0;
        let totalCost = 0;
        
        if (binanceResponse.fills && binanceResponse.fills.length > 0) {
          for (const fill of binanceResponse.fills) {
            const qty = parseFloat(fill.qty);
            const price = parseFloat(fill.price);
            totalQty += qty;
            totalCost += qty * price;
          }
        }
        
        const avgPrice = totalQty > 0 ? totalCost / totalQty : parseFloat(binanceResponse.price);
        const filledQty = parseFloat(binanceResponse.executedQty);
        
        // Calculate fee (Binance testnet doesn't always provide fee info)
        let fee = filledQty * avgPrice * 0.001; // Estimate 0.1% fee
        if (binanceResponse.fills && binanceResponse.fills.length > 0) {
          fee = binanceResponse.fills.reduce((total: number, fill: any) => {
            return total + (fill.commission ? parseFloat(fill.commission) : 0);
          }, 0);
        }
        
        // Record the fill in our database
        const trade = await prisma.trade.create({
          data: {
            orderId: dbOrder.id,
            symbol: order.symbol,
            side: order.side,
            qty: filledQty,
            price: avgPrice,
            feePaid: fee,
            pnl: 0,
            botId: this.botId,
            externalId: binanceResponse.orderId.toString()
          }
        });
        
        // Return fill information
        const fill: Fill = {
          id: trade.id.toString(),
          symbol: order.symbol,
          side: order.side,
          qty: filledQty,
          price: avgPrice,
          fee,
          timestamp: Date.now(),
          orderId: dbOrder.id.toString()
        };
        
        return fill;
      }
      
      // For non-filled orders, wait for fill
      const orderId = binanceResponse.orderId.toString();
      const fill = await this.waitForFill(orderId, order);
      
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
          externalId: orderId
        }
      });
      
      // Update the fill with our database ID
      fill.id = trade.id.toString();
      fill.orderId = dbOrder.id.toString();
      
      return fill;
    } catch (error) {
      logger.error(`Error placing order with Binance: ${String(error)}`);
      
      // Fall back to simulation
      return this.fallbackToSimulation(order);
    }
  }
  
  private async waitForFill(binanceOrderId: string, originalOrder: Order, maxAttempts = 10): Promise<Fill> {
    // Poll for order status
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Wait between polls (increasing delay for backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(1.5, attempt)));
        
        // Generate signature for Binance API
        const timestamp = Date.now();
        const queryParams = new URLSearchParams({
          symbol: originalOrder.symbol.replace('/', ''),
          orderId: binanceOrderId,
          timestamp: timestamp.toString()
        });
        
        const signature = crypto
          .createHmac('sha256', this.apiSecret)
          .update(queryParams.toString())
          .digest('hex');
        
        queryParams.append('signature', signature);
        
        // Get order status
        const orderUrl = `${this.baseUrl}/v3/order?${queryParams.toString()}`;
        const response = await fetch(orderUrl, {
          method: 'GET',
          headers: {
            'X-MBX-APIKEY': this.apiKey
          }
        });
        
        if (!response.ok) {
          logger.error(`Error checking order status: ${response.status} ${response.statusText}`);
          continue;
        }
        
        const order = await response.json() as any;
        
        // Check if order is filled
        if (order.status === 'FILLED') {
          logger.info(`Order ${binanceOrderId} filled: ${order.executedQty} @ avg price ${order.price}`);
          
          // Create fill object
          const fill: Fill = {
            id: binanceOrderId,
            symbol: originalOrder.symbol,
            side: originalOrder.side,
            qty: parseFloat(order.executedQty),
            price: parseFloat(order.price),
            fee: parseFloat(order.executedQty) * parseFloat(order.price) * 0.001, // Estimate fee
            timestamp: order.updateTime || Date.now()
          };
          
          return fill;
        }
        
        // If order is rejected or canceled, fall back to simulation
        if (['REJECTED', 'CANCELED', 'EXPIRED'].includes(order.status)) {
          logger.warn(`Order ${binanceOrderId} ${order.status}: ${order.rejectReason || 'unknown reason'}`);
          break;
        }
        
        logger.info(`Order ${binanceOrderId} status: ${order.status}, waiting...`);
      } catch (error) {
        logger.error(`Error polling order status: ${String(error)}`);
      }
    }
    
    // If we get here, order wasn't filled after max attempts or was rejected
    logger.warn(`Order ${binanceOrderId} not filled after ${maxAttempts} attempts, falling back to simulation`);
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
    const fee = fillPrice * order.qty * 0.001; // 0.1% for Binance
    
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