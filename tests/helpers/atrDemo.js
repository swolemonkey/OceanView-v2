const { RiskManager } = require('../../packages/server/src/bots/hypertrades/risk');
const { defaultConfig } = require('../../packages/server/src/bots/hypertrades/config');

function atrSizingDemo(atrPct) {
  const rm = new RiskManager(undefined, { ...defaultConfig, riskPct: 1 });
  rm.equity = 10000;
  rm['perception'] = { indicators: { atr: () => atrPct * 100 } };
  return rm.sizeTrade(99, 100);
}

module.exports = { atrSizingDemo };
