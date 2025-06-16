import { prisma } from '../../packages/server/src/db';
import { seedTradableAssets } from '../../scripts/seedAll';

test('≥20 assets seeded', async () => {
  await seedTradableAssets();
  const n = await prisma.tradableAsset.count();
  expect(n).toBeGreaterThanOrEqual(20);
});
