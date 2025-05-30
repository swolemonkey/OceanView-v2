export interface Tick {
  symbol: string;
  price: number;
  timestamp: number;
  volume?: number;
  bid?: number;
  ask?: number;
}

export interface DataFeed {
  subscribe(symbol: string, cb: (tick: Tick) => void): void;
} 