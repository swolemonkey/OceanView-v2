import { ExecutionEngine, Order, Fill } from './interface.js';

export class BinanceFuturesEngine implements ExecutionEngine {
  supportsOCO = true;
  async place(order: Order): Promise<Fill> {
    return {
      id: `fut-${Date.now()}`,
      symbol: order.symbol,
      side: order.side,
      qty: order.qty,
      price: order.price,
      fee: 0,
      timestamp: Date.now()
    };
  }
}
