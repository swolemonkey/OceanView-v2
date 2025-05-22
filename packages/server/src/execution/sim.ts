import { prisma } from '../db.js';

export async function placeSimOrder(
  symbol: string,
  side: 'buy' | 'sell',
  qty: number,
  price: number,
  botId?: number
) {
  // Look up wallet equity
  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  const equity = bot?.equity ?? 10_000;

  // Calculate slippage based on order size relative to equity
  const impact = (qty * price) / equity * 0.0015; // 0.15%
  const fill = side === 'buy' ? price * (1 + impact) : price * (1 - impact);
  
  // Calculate fee
  const fee = fill * qty * 0.0004;
  
  // Create order
  const order = await prisma.order.create({
    data: { symbol, side, qty, price }
  });
  
  // Simulate latency
  await new Promise(r => setTimeout(r, Math.random() * 400));
  
  // Create trade with fill price and fee
  await prisma.trade.create({
    data: { 
      orderId: order.id, 
      symbol, 
      side, 
      qty, 
      price: fill, 
      feePaid: fee, 
      pnl: 0 
    }
  });
  
  // Return enhanced order info
  return { ...order, fill, fee };
} 