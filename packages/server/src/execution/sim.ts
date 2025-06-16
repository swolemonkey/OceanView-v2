import { ExecutionEngine, Order, Fill } from './interface.js';
import { prisma } from '../db';
import { randomUUID } from 'crypto';

export class SimEngine implements ExecutionEngine {
  private botId?: number;
  private strategyName?: string;
  
  constructor(botId?: number, strategyName?: string) {
    this.botId = botId;
    this.strategyName = strategyName;
  }

  async place(order: Order, ctx?: { botId?: number, strategyName?: string }): Promise<Fill> {
    // Get context values or use constructor values
    const botId = ctx?.botId || this.botId || 1; // Default to 1 if not provided
    const strategyName = ctx?.strategyName || this.strategyName || 'default';
    
    // Look up wallet equity
    const bot = await prisma.bot.findUnique({ where: { id: botId } });
    const equity = bot?.equity ?? 10_000;

    // Calculate slippage based on order size relative to equity
    const impact = (order.qty * order.price) / equity * 0.0015; // 0.15%
    const fillPrice = order.side === 'buy' ? order.price * (1 + impact) : order.price * (1 - impact);
    
    // Calculate fee
    const fee = fillPrice * order.qty * 0.0004;
    
    // Create order in DB
    const dbOrder = await prisma.order.create({
      data: { 
        symbol: order.symbol, 
        side: order.side, 
        qty: order.qty, 
        price: order.price,
        type: order.type || 'market',
        botId: botId,
        status: 'filled',
        exchange: 'simulation',
        clientOrderId: `sim-${Date.now()}`
      }
    });
    
    // Simulate latency
    await new Promise(r => setTimeout(r, Math.random() * 400));
    
    // Create trade with fill price and fee
    const trade = await prisma.trade.create({
      data: { 
        orderId: dbOrder.id, 
        symbol: order.symbol, 
        side: order.side, 
        qty: order.qty, 
        price: fillPrice, 
        fee: fee, 
        strategy: strategyName
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
      orderId: dbOrder.id.toString()
    };
    
    return fill;
  }
}

// Legacy function for backward compatibility
export async function placeSimOrder(
  symbol: string,
  side: 'buy' | 'sell',
  qty: number,
  price: number,
  botId?: number,
  strategyName?: string
) {
  const engine = new SimEngine(botId, strategyName);
  const fill = await engine.place(
    { symbol, side, qty, price }, 
    { botId, strategyName }
  );
  
  // Return in the legacy format
  return { 
    id: fill.orderId, 
    symbol, 
    side, 
    qty, 
    price, 
    fill: fill.price, 
    fee: fill.fee 
  };
} 