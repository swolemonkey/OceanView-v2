import { prisma } from '../db.js';

export async function placeSimOrder(
  symbol:string,
  side:'buy'|'sell',
  qty:number,
  price:number
){
  const order = await prisma.order.create({
    data:{ symbol, side, qty, price }
  });
  const fee = price * qty * 0.0004;
  await prisma.trade.create({
    data:{ orderId:order.id, symbol, side, qty, price, pnl:0, fee }
  });
  return order;
} 