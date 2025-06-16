jest.setTimeout(30000);
import { PolygonDataFeed } from '../../packages/server/src/feeds/polygonDataFeed.ts';

test('Polygon fetch 30 mins BTC', async () => {
  const mock = jest.spyOn(global as any, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ results: Array.from({ length: 10 }, (_, i) => ({ t: i, o: 1, h: 1, l: 1, c: 1 })) })
  } as any);
  const feed = new PolygonDataFeed('X:BTCUSD');
  const iter = feed.iterate('2025-05-01', '2025-05-01');
  let count = 0;
  for await (const _ of iter) {
    if (++count > 5) break;
  }
  mock.mockRestore();
  expect(count).toBeGreaterThan(0);
});
