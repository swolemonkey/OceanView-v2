import { prisma } from '../packages/server/src/db.js';
import fs from 'fs';
import path from 'path';
import { runReplayViaFeed } from '../scripts/replay_historical.js';
import { PolygonDataFeed } from '../packages/server/src/feeds/polygonDataFeed.js';

const START = process.env.BT_START ?? '2025-03-01';
const END = process.env.BT_END ?? '2025-06-01';
const outDir = 'backtest-output';
fs.mkdirSync(outDir, { recursive: true });

const assets = await prisma.tradableAsset.findMany({ where: { active: true } });
const summary: any[] = [];
for (const a of assets) {
  const feed = new PolygonDataFeed(a.symbol);
  await runReplayViaFeed(a.symbol, feed.iterate(START, END));
  const rows = await prisma.trade.findMany({ where: { symbol: a.symbol } });
  fs.writeFileSync(path.join(outDir, `${a.symbol}.json`), JSON.stringify(rows, null, 2));
  const pnl = rows.reduce((p, r: any) => p + (Number(r.pnl) || 0), 0);
  summary.push({ symbol: a.symbol, trades: rows.length, pnl });
}
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
console.table(summary);
process.exit(0);
