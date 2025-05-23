import { Perception } from './bots/hypertrades/perception.js';
import { decide } from './bots/hypertrades/decision.js';
import { RiskManager } from './bots/hypertrades/risk.js';
import { executeIdea } from './bots/hypertrades/execution.js';
import { loadConfig } from './bots/hypertrades/config.js';
import { prisma } from './db.js';
import { getLatestPrices } from './services/marketData.js';

interface Config {
  smc: { thresh: number };
  ta: { rsiPeriod: number; overSold: number; overBought: number };
  riskPct: number;
  symbol: string;
}

interface TradeIdea {
  symbol: string;
  side: string;
  price: number;
  reason?: string;
  qty?: number;
}

/**
 * Main bot loop that continuously fetches market data, 
 * evaluates strategies, and places simulated trades.
 */
export async function run_bot(): Promise<void> {
  console.log(`[${new Date().toISOString()}] HyperTrades bot starting up...`);
  
  // Initialize bot components
  const perception = new Perception();
  const risk = new RiskManager(1); // botId 1 for main bot
  
  // Load configuration
  const cfg = await loadConfig();
  console.log(`[${new Date().toISOString()}] HyperTrades loaded config:`, cfg);
  
  // Report metrics every minute
  setInterval(() => {
    console.log(`[${new Date().toISOString()}] METRICS: Equity: $${risk.equity.toFixed(2)}, PnL: $${risk.dayPnL.toFixed(2)}`);
    
    // Save metrics to database
    try {
      // Use console log instead of DB operations until we have the right schema
      console.log(`[${new Date().toISOString()}] Would save metrics: { botId: 1, equity: ${risk.equity}, pnl: ${risk.dayPnL} }`);
      
      /* Uncomment when metric table exists
      prisma.metric.create({ 
        data:{
          botId: 1, // Main bot ID
          equity: risk.equity,
          pnl: risk.dayPnL
        }
      });
      */
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error saving metrics:`, error);
    }
  }, 60000);
  
  // Main loop
  while (true) {
    try {
      const timestamp = new Date().toISOString();
      
      // Fetch latest prices
      console.log(`[${timestamp}] Fetching market data...`);
      const prices = await getLatestPrices();
      
      if (!prices) {
        console.log(`[${timestamp}] No price data available, skipping cycle`);
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30 second polling
        continue;
      }
      
      // Get BTC price (primary trading asset)
      const btcPrice = prices.BTC;
      if (!btcPrice) {
        console.log(`[${timestamp}] No BTC price available, skipping cycle`);
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30 second polling
        continue;
      }
      
      console.log(`[${timestamp}] BTC price: $${btcPrice.toFixed(2)}`);
      
      // Add tick to perception system
      perception.addTick(btcPrice, Date.now());
      
      // Get trading decision
      const idea = await decide(perception, cfg) as TradeIdea | null;
      
      if (idea) {
        // Log decision with reason
        console.log(`[${timestamp}] DECISION: ${idea.side.toUpperCase()} BTC @ $${idea.price.toFixed(2)} | Reason: ${idea.reason || 'Technical analysis signals'}`);
        
        // Check risk management
        if (!risk.canTrade()) {
          console.log(`[${timestamp}] BLOCKED: Risk limits exceeded. Open risk: ${risk.openRisk.toFixed(2)}%`);
        } else {
          // Size the trade based on risk
          const qty = risk.sizeTrade(idea.price);
          
          // Execute the trade
          const orderIdea = { 
            ...idea, 
            side: idea.side as 'buy'|'sell',
            qty 
          };
          
          // Log trade execution
          console.log(`[${timestamp}] EXECUTING: ${idea.side.toUpperCase()} ${qty.toFixed(6)} BTC @ $${idea.price.toFixed(2)}`);
          
          // Execute the trade
          const result = await executeIdea(orderIdea, (msg: string) => console.log(`[${timestamp}] ${msg}`));
          
          // Register the order in risk management
          risk.registerOrder(idea.side as 'buy'|'sell', qty, idea.price);
          
          // Record the experience for learning
          await prisma.experience.create({
            data:{
              symbol: 'BTC',
              price: idea.price,
              smcThresh: cfg.smc.thresh,
              rsiOS: cfg.ta.overSold,
              reward: risk.dayPnL
            }
          });
          
          // Log trade completion
          console.log(`[${timestamp}] COMPLETED: ${idea.side.toUpperCase()} ${qty.toFixed(6)} BTC @ $${idea.price.toFixed(2)} | PnL: $${risk.dayPnL.toFixed(2)}`);
        }
      } else {
        console.log(`[${timestamp}] DECISION: HOLD BTC @ $${btcPrice.toFixed(2)} | No signals detected`);
      }
      
      // Wait for next polling interval (30 seconds)
      await new Promise(resolve => setTimeout(resolve, 30000));
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Bot error:`, error);
      // If there's an error, wait a bit and continue the loop
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
} 