import { ExecutionEngine, Order } from './interface.js';

export async function placeWithOCO(
  exec: ExecutionEngine,
  order: Order,
  stop: number,
  target: number
) {
  const baseFill = await exec.place(order);
  if (!baseFill) return baseFill;

  if (order.side === 'buy') {
    await exec.place({ ...order, type:'STOP_MARKET', side:'sell', price: stop });
    await exec.place({ ...order, type:'LIMIT', side:'sell', price: target });
  } else {
    await exec.place({ ...order, type:'STOP_MARKET', side:'buy', price: stop });
    await exec.place({ ...order, type:'LIMIT', side:'buy', price: target });
  }
  return baseFill;
}
