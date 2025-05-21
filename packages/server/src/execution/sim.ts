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
  await prisma.trade.create({
    data:{ orderId:order.id, symbol, side, qty, price, pnl:0 }
  });
  return order;
} 