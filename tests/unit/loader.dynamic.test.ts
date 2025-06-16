jest.mock('../../packages/server/src/feeds/coingeckoFeed', () => ({
  CoinGeckoFeed: class { subscribe() {} }
}));
jest.mock('../../packages/server/src/feeds/alpacaFeed', () => ({
  AlpacaFeed: class { subscribe() {} }
}));
jest.mock('../../packages/server/src/feeds/binanceWsFeed', () => ({
  BinanceWsFeed: class { subscribe() {} }
}));
jest.mock('../../packages/server/src/execution/binanceTestnet', () => ({
  BinanceTestnetEngine: class {}
}));
jest.mock('../../packages/server/src/execution/alpacaPaper', () => ({
  AlpacaPaperEngine: class {}
}));
jest.mock('../../packages/server/src/execution/binanceFutures', () => ({
  BinanceFuturesEngine: class {}
}));

import loadAgents from '../../packages/server/src/loader';
import { seedTradableAssets } from '../../scripts/seedAll';

test('loader instantiates active symbols', async () => {
  await seedTradableAssets();
  const agents = await loadAgents();
  expect(agents.length).toBeGreaterThanOrEqual(20);
});
