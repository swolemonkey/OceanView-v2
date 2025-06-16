import { runReplayViaFeed } from './replay_historical.js';
import { PolygonDataFeed } from '../packages/server/src/feeds/polygonDataFeed.js';

const [,, symbol, start, end] = process.argv;
if (!symbol || !start || !end) {
  console.log('Usage: ts-node backtest_polygon.ts <SYM> <start> <end>');
  process.exit(1);
}

(async () => {
  const feed = new PolygonDataFeed(symbol);
  await runReplayViaFeed(symbol, feed.iterate(start, end));
})();
