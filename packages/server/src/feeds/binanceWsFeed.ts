import { DataFeed, Tick } from './interface.js';

export class BinanceWsFeed implements DataFeed {
  subscribe(_symbol: string, _cb: (tick: Tick) => void): void {
    // Placeholder implementation for tests
  }
}
