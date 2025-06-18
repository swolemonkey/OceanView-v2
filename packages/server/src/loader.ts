import { PrismaClient } from '@prisma/client';
import { AssetAgent } from './bots/hypertrades/assetAgent.js';
import { loadConfig } from './bots/hypertrades/config.js';
import { CoinGeckoFeed } from './feeds/coingeckoFeed.js';
import { AlpacaFeed } from './feeds/alpacaFeed.js';
import { BinanceTestnetEngine } from './execution/binanceTestnet.js';
import { AlpacaPaperEngine } from './execution/alpacaPaper.js';
import { BinanceFuturesEngine } from './execution/binanceFutures.js';
import type { DataFeed } from './feeds/interface.js';
import type { ExecutionEngine } from './execution/interface.js';

const prisma = new PrismaClient();

function feedFactory(a: { symbol: string; assetClass: string }): DataFeed {
  if (a.assetClass === 'equity') return new AlpacaFeed();
  return new CoinGeckoFeed();
}

function execFactory(a: { symbol: string; assetClass: string }): ExecutionEngine {
  if (a.assetClass === 'future') return new BinanceFuturesEngine();
  if (a.assetClass === 'equity') return new AlpacaPaperEngine();
  return new BinanceTestnetEngine();
}

export default async function loadAgents() {
  const cfg = await loadConfig();
  const assets = await prisma.tradableAsset.findMany({ where: { active: true } });
  const agents: AssetAgent[] = [];
  for (const a of assets) {
    const feed = feedFactory(a);
    const exec = execFactory(a);
    const agent = new AssetAgent(a.symbol, cfg, 1, 1, feed, exec);
    agents.push(agent);
  }
  return agents;
}
