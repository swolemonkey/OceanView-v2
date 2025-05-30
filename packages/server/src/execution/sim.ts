import { ExecutionEngine, Order, Fill } from './interface.js';
import { prisma } from '../db.js';
import { randomUUID } from 'crypto';

export class SimEngine implements ExecutionEngine {
  private botId?: number;
  
  constructor(botId?: number) {
    this.botId = botId;
  }

  async place(order: Order): Promise<Fill> {
    // Look up wallet equity
    const bot = await prisma.bot.findUnique({ where: { id: this.botId } });
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
        botId: this.botId
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
        feePaid: fee, 
        pnl: 0,
        botId: this.botId
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
  botId?: number
) {
  const engine = new SimEngine(botId);
  const fill = await engine.place({ symbol, side, qty, price });
  
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