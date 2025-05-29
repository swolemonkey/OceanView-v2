import fetch from 'node-fetch';

async function fetchMetrics() {
  try {
    const response = await fetch('http://localhost:3334/metrics');
    const metrics = await response.json();
    
    // Format and display metrics in a readable way
    console.log('\n=== Bot Metrics ===\n');
    console.log(`Equity:              $${metrics.equity.toFixed(2)}`);
    console.log(`PnL:                 $${metrics.pnl.toFixed(2)}`);
    console.log(`Drawdown:            ${metrics.drawdown.toFixed(2)}%`);
    console.log(`Trades (24h):        ${metrics.tradeCount24h}`);
    console.log(`Gatekeeper Veto:     ${(metrics.gatekeeperVetoRatio * 100).toFixed(2)}%`);
    console.log(`Latest Sentiment:    ${metrics.latestSentiment.toFixed(2)}`);
    console.log(`Order Book Imbalance: ${metrics.latestOrderBookImbalance.toFixed(2)}`);
    console.log('\n');
    
    return metrics;
  } catch (error) {
    console.error('Failed to fetch metrics:', error);
    process.exit(1);
  }
}

// Execute if called directly
if (require.main === module) {
  fetchMetrics();
}

export { fetchMetrics }; 