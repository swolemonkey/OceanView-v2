export interface Order {
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  type?: 'market' | 'limit';
  timeInForce?: 'day' | 'gtc' | 'ioc';
  limitPrice?: number;
  stopPrice?: number;
}

export interface Fill {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  fee: number;
  timestamp: number;
  orderId?: string;
}

export interface ExecutionEngine {
  place(order: Order): Promise<Fill>;
} 