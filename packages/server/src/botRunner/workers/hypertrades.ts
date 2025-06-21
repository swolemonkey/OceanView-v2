import { parentPort, workerData } from 'worker_threads';
import { loadConfig } from '../../bots/hypertrades/config.js';
import { AssetAgent } from '../../bots/hypertrades/assetAgent.js';
import { logCompletedTrade } from '../../bots/hypertrades/execution.js';
import { prisma } from '../../db.js';
import type { Candle } from '../../bots/hypertrades/perception.js';
import { PortfolioRiskManager } from '../../risk/portfolioRisk.js';
import { RLGatekeeper, FeatureVector } from '../../rl/gatekeeper.js';
import { createLogger, type EnhancedLogger, type TradeContext, type PortfolioContext, type ExecutionContext, type DatabaseContext } from '../../utils/logger.js';
import { validationOrchestrator } from '../../utils/validation.js';
import { DatabaseManager } from '../../utils/databaseManager.js';

// Create enhanced logger for worker
const logger = createLogger('hypertrades-worker');

// Global vars and agent tracking
let agents = new Map<string, AssetAgent>();
let versionId: number;

// Track last candle times for each symbol
const lastCandleTimes = new Map<string, number>();
// Portfolio risk manager
let portfolio: PortfolioRiskManager;
// RL Gatekeeper
let rlGatekeeper: RLGatekeeper;
// Trading halted flag
let tradingHalted = false;
// Track RL dataset entries by order ID
const rlEntryIds = new Map<string, number>();

async function init() {
  try {
    // Verify database connection before initialization
    const isConnected = await DatabaseManager.verifyConnection();
    if (!isConnected) {
      logger.error('Worker failed to connect to database during initialization', { 
        context: 'worker_init',
        phase: 'connection_check'
      });
      process.exit(1);
    }

    // Get config and bot info
    const cfg = await loadConfig();
    
    // Use default values if workerData is null
    const botData = workerData || { botId: 1, stratVersion: 'dev-local' };
    const { botId, stratVersion } = botData as { botId: number; stratVersion: string };
    
    logger.info(`HyperTrades loaded config for symbols: ${cfg.symbols.join(',')}`, {
      symbolCount: cfg.symbols.length,
      symbols: cfg.symbols,
      botId,
      stratVersion
    });
    
    // Upsert the strategy version with transaction
    const versionRow = await DatabaseManager.withTransaction(async (tx) => {
      return await tx.strategyVersion.upsert({
        where: { hash: stratVersion },
        update: {},
        create: { hash: stratVersion, description: 'auto‑created' }
      });
    }, 'upsert_strategy_version');
    
    versionId = versionRow.id;
    logger.info(`Using strategy version: ${stratVersion}, ID: ${versionId}`, {
      stratVersion,
      versionId,
      phase: 'version_setup'
    });
    
    // Create an agent for each configured symbol
    for (const symbol of cfg.symbols) {
      logger.info(`Creating agent for ${symbol}`, { 
        symbol,
        phase: 'agent_creation'
      });
      
      const agent = new AssetAgent(symbol, cfg, botId, versionId);
      
      // Initialize agent with optimized configuration
      await agent.initialize();
      
      agents.set(symbol, agent);
      lastCandleTimes.set(symbol, 0);
    }
    
    // Initialize portfolio risk manager with config
    portfolio = new PortfolioRiskManager();
    await portfolio.init();
    
    // Initialize RL Gatekeeper
    rlGatekeeper = new RLGatekeeper(versionId);
    
    // Report metrics every minute - combined from all agents
    setInterval(() => {
      let totalEquity = 0;
      let totalPnl = 0;
      
      for (const agent of agents.values()) {
        totalEquity += agent.risk.equity;
        totalPnl += agent.risk.dayPnL;
      }
      
      // Update portfolio risk manager
      portfolio.recalc(agents);
      
      // Log portfolio metrics
      const portfolioData: PortfolioContext = {
        totalEquity,
        totalPnL: totalPnl,
        openRisk: portfolio.openRiskPct,
        dayPnL: portfolio.dayPnl,
        positionCount: Array.from(agents.values()).reduce((count, agent) => count + agent.risk.positions.length, 0),
        canTrade: portfolio.canTrade(),
        reason: portfolio.canTrade() ? 'within_limits' : 'risk_limits_exceeded'
      };
      
      logger.logPortfolioRisk('ALL_SYMBOLS', portfolioData);
      
      // Check if trading should be halted due to risk limits with enhanced analysis
      const canTrade = portfolio.canTrade(agents);
      if (!canTrade && !tradingHalted) {
        const riskSummary = portfolio.getRiskSummary(agents);
        logger.warn('TRADING HALTED - Enhanced risk analysis', {
          riskLevel: riskSummary.riskLevel,
          breachCount: riskSummary.breachCount,
          warningCount: riskSummary.warningCount,
          checkId: riskSummary.checkId,
          openRisk: portfolio.openRiskPct,
          dayPnL: portfolio.dayPnl,
          reason: 'enhanced_risk_limits_exceeded'
        });
        tradingHalted = true;
      }
      
      parentPort?.postMessage({ 
        type: 'metric', 
        equity: totalEquity, 
        pnl: totalPnl 
      });
    }, 60000);

    logger.info('Worker initialization completed successfully', {
      agentCount: agents.size,
      symbols: Array.from(agents.keys()),
      phase: 'init_complete'
    });
  } catch (error) {
    logger.error('Worker initialization failed', { 
      error: error instanceof Error ? error.message : String(error),
      phase: 'init_error'
    });
    process.exit(1);
  }
}

init().catch(err => {
  logger.error('[hypertrades] init error', { error: err });
  process.exit(1);
});

parentPort?.on('message', async (m) => {
  if (m.type === 'tick') {
    const { prices, ts } = JSON.parse(m.data);
    const epoch = Date.parse(ts);
    
    // Get current minute timestamp (truncated to minute)
    const currentMinute = Math.floor(epoch / 60000) * 60000;
    
    // Process ticks for each agent if price data is available
    for (const [symbol, agent] of agents.entries()) {
      const price = prices[symbol]?.usd;
      if (!price) continue;
      
      try {
        // Process the tick
        await agent.onTick(price, epoch);
        
        // Get the last recorded candle time for this symbol
        const lastCandleTime = lastCandleTimes.get(symbol) || 0;
        
        // If we've moved to a new minute, the previous candle has closed
        if (currentMinute > lastCandleTime && lastCandleTime > 0) {
          // Get the last candle from perception (the one that just closed)
          const lastCandles = agent.perception.last(1);
          if (lastCandles.length > 0) {
            const closedCandle: Candle = lastCandles[0];
            
            // Update portfolio risk metrics before processing trade ideas
            portfolio.recalc(agents);
            
            // Log portfolio risk status
            const portfolioData: PortfolioContext = {
              totalEquity: portfolio.equity,
              totalPnL: portfolio.dayPnl,
              openRisk: portfolio.openRiskPct,
              positionCount: Array.from(agents.values()).reduce((count, agent) => count + agent.risk.positions.length, 0),
              canTrade: portfolio.canTrade(),
              reason: portfolio.canTrade() ? 'within_limits' : 'risk_limits_exceeded'
            };
            
            logger.logPortfolioRisk(symbol, portfolioData);
            
            // Check if we can trade based on portfolio risk limits with enhanced analysis
            if (!portfolio.canTrade(agents)) {
              tradingHalted = true;
              const riskSummary = portfolio.getRiskSummary(agents);
              logger.warn(`Trading halted for ${symbol} - Enhanced portfolio risk analysis`, {
                symbol,
                riskLevel: riskSummary.riskLevel,
                canTrade: riskSummary.canTrade,
                breachCount: riskSummary.breachCount,
                warningCount: riskSummary.warningCount,
                checkId: riskSummary.checkId,
                openRisk: portfolio.openRiskPct,
                dayPnL: portfolio.dayPnl,
                reason: 'enhanced_portfolio_risk_exceeded'
              });
              
              // Skip trade processing
              lastCandleTimes.set(symbol, currentMinute);
              continue;
            }
            
            // Call onCandleClose with the closed candle to process trade ideas
            await agent.onCandleClose(closedCandle);
            logger.debug(`Closed candle for ${symbol} at ${new Date(closedCandle.ts).toISOString()}`, {
              symbol,
              candleTime: new Date(closedCandle.ts).toISOString(),
              price: closedCandle.c
            });
          }
        }
        
        // Update the last candle time for this symbol
        lastCandleTimes.set(symbol, currentMinute);
      } catch (error) {
        logger.error(`Error processing tick for ${symbol}`, {
          error: error instanceof Error ? error.message : String(error),
          symbol,
          price,
          timestamp: epoch,
          phase: 'tick_processing'
        });
      }
    }
  }
  
  if (m.type === 'orderResult') {
    logger.info(`Order result received`, { 
      orderData: JSON.stringify(m.data),
      phase: 'order_result_start'
    });
    
    const { order } = m.data;
    const processStartTs = Date.now();
    
    // Extract or generate trade ID for tracking
    const tradeId = order.tradeId || `order_${order.symbol}_${order.side}_${Date.now()}`;
    
    try {
      // Find the agent for this symbol
      const agent = agents.get(order.symbol);
      if (!agent) {
        logger.error(`No agent found for symbol ${order.symbol}`, {
          tradeId,
          symbol: order.symbol,
          availableAgents: Array.from(agents.keys()),
          phase: 'agent_lookup'
        });
        return;
      }
      
      // Add entry timestamp if not present
      if (!order.entryTs) {
        order.entryTs = Date.now() - 1000; // Assume 1 second ago if not provided
      }
      
      // Log trade verification
      logger.logTradeVerification(tradeId, order.symbol, true, {
        orderSide: order.side,
        orderQty: order.qty,
        orderPrice: order.price,
        orderPnL: order.pnl,
        phase: 'order_verification'
      });
      
      // Use transaction to ensure atomic processing of order result
              await DatabaseManager.withTransaction(async (tx) => {
        // Close the position using agent's closePositions method which updates portfolio risk
        await agent.closePositions(order.price);
        
        // Get the RL entry ID for this order
        const entryId = rlEntryIds.get(`${order.symbol}-${order.entryTs}`);
        
        // Update RL Dataset with outcome (individual trade PnL)
        if (entryId) {
          try {
            await rlGatekeeper.updateOutcome(entryId, order.pnl);
            // Remove the entry from our tracking map after updating
            rlEntryIds.delete(`${order.symbol}-${order.entryTs}`);
            logger.info(`✅ Updated RL outcome for entry ${entryId}: PnL ${order.pnl}`, {
              tradeId,
              entryId,
              pnl: order.pnl,
              symbol: order.symbol
            });
          } catch (error) {
            logger.error('Error updating RL outcome', { 
              tradeId,
              error: error instanceof Error ? error.message : String(error),
              entryId,
              pnl: order.pnl
            });
          }
        }
        
        // Log the completed trade with enhanced error handling
        await logCompletedTrade(
          {
            ...order,
            pnl: order.pnl, // Use the individual trade PnL
          },
          workerData.name,
          versionId
        );
        
        // Validate trade execution
        const validationResult = await validationOrchestrator.validateExecution(
          tradeId,
          order.symbol,
          order.side,
          order.qty,
          order.price,
          {
            shouldBeRecorded: true,
            expectedPnL: order.pnl
          }
        );

        if (!validationResult.success) {
          logger.warn(`⚠️ WORKER VALIDATION WARNING: Trade validation failed for order result`, {
            tradeId,
            validationId: validationResult.validationId,
            checks: validationResult.checks,
            message: validationResult.message
          });
        } else {
          logger.info(`✅ WORKER VALIDATION: Trade validation passed for order result`, {
            tradeId,
            validationId: validationResult.validationId
          });
        }
        
        // Log trade lifecycle completion
        logger.logTradeLifecycle('EXIT', {
          tradeId,
          symbol: order.symbol,
          side: order.side,
          qty: order.qty,
          price: order.price,
          pnl: order.pnl,
          reason: 'order_result',
          strategyName: workerData.name,
          versionId
        });
        
        logger.info(`✅ TRADE COMPLETED: ${order.side.toUpperCase()} ${order.qty} ${order.symbol} @ $${order.price} | PnL: $${order.pnl}`, {
          tradeId,
          symbol: order.symbol,
          side: order.side.toUpperCase(),
          qty: order.qty,
          price: order.price,
          pnl: order.pnl
        });
      }, 'process_order_result', tradeId);
      
      // Send metrics update after position close - combined from all agents
      let totalEquity = 0;
      let totalPnl = 0;
      
      for (const a of agents.values()) {
        totalEquity += a.risk.equity;
        totalPnl += a.risk.dayPnL;
      }
      
      // Update portfolio risk manager
      portfolio.recalc(agents);
      
      // Log execution metrics
      logger.logExecutionMetrics(order.symbol, {
        totalPnL: totalPnl,
        tradeCount: 1, // This is one completed trade
        avgExecutionTime: Date.now() - processStartTs
      });
      
      // Check if trading can resume after this position close
      if (!tradingHalted && portfolio.canTrade()) {
        logger.info(`Trading enabled - Portfolio risk metrics within limits`, {
          tradeId,
          openRisk: portfolio.openRiskPct,
          dayPnL: portfolio.dayPnl
        });
      } else if (tradingHalted && portfolio.canTrade()) {
        tradingHalted = false;
        logger.info(`Trading resumed - Portfolio risk metrics now within limits`, {
          tradeId,
          openRisk: portfolio.openRiskPct,
          dayPnL: portfolio.dayPnl,
          reason: 'risk_limits_restored'
        });
      }
      
      parentPort?.postMessage({ 
        type: 'metric', 
        equity: totalEquity, 
        pnl: totalPnl 
      });
      
             logger.info(`Order result processed`, {
         tradeId,
         processingTime: Date.now() - processStartTs,
         totalEquity,
         totalPnL: totalPnl,
         phase: 'order_result_complete'
       });
    } catch (error) {
      logger.error(`Error processing order result`, {
        tradeId,
        error: error instanceof Error ? error.message : String(error),
        order: JSON.stringify(order),
        processingTime: Date.now() - processStartTs,
        phase: 'order_result_error'
      });
      
      // Log trade verification failure
      logger.logTradeVerification(tradeId, order.symbol, false, {
        error: error instanceof Error ? error.message : String(error),
        orderData: JSON.stringify(order),
        phase: 'order_verification_failed'
      });
      
      // Log failed order processing to database for analysis
      try {
        await DatabaseManager.withRetry(async () => {
          await prisma.rLDataset.create({
            data: {
              symbol: order.symbol,
              featureVec: JSON.stringify({
                symbol: order.symbol,
                error: error instanceof Error ? error.message : String(error),
                order: JSON.stringify(order),
                processingTime: Date.now() - processStartTs
              }),
              action: 'order_result_failed',
              outcome: -1,
              strategyVersionId: versionId
            }
          });
        }, 'log_failed_order_processing', 3, tradeId);
      } catch (dbError) {
        logger.error('Failed to log order processing error to database', { 
          tradeId,
          dbError: dbError instanceof Error ? dbError.message : String(dbError) 
        });
      }
    }
  }
});

// Helper function to store RL entry ID when a trade is initiated
export function storeRLEntryId(symbol: string, timestamp: number, id: number): void {
  const entryKey = `${symbol}-${timestamp}`;
  rlEntryIds.set(entryKey, id);
  
  logger.debug('Stored RL entry ID for tracking', {
    symbol,
    timestamp,
    entryId: id,
    entryKey,
    phase: 'rl_entry_tracking'
  });
} 