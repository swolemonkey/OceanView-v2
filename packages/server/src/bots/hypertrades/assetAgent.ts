import { Perception, Candle } from './perception.js';
import { RiskManager } from './risk.js';
import { executeIdea } from './execution.js';
import type { Config } from './config.js';
import * as Indicators from './indicators/index.js';
import { BaseStrategy } from './strategies/baseStrategy.js';
import { SMCReversal } from './strategies/smcReversal.js';
import { TrendFollowMA as TrendFollowMAOld } from './strategies/trendFollow.js';
import { RangeBounce as RangeBounceOld } from './strategies/rangeBounce.js';
import { TrendFollowMA } from './strategies/trendFollowMA.js';
import { RangeBounce } from './strategies/rangeBounce.js';
import { MomentumScalp } from './strategies/momentumScalp.js';
import { passRR, passRRDynamic } from './utils/riskReward.js';
import type { DataFeed, Tick } from '../../feeds/interface.js';
import type { ExecutionEngine, Order } from '../../execution/interface.js';
import { SimEngine } from '../../execution/sim.js';
import { placeWithOCO } from '../../execution/ocoWrapper.js';
import { gate } from '../../rl/gatekeeper.js';
import { storeRLEntryId } from '../../botRunner/workers/hypertrades.js';
import { PortfolioRiskManager } from '../../risk/portfolioRisk.js';
import { createLogger, type EnhancedLogger, type TradeContext, type PortfolioContext, type ExecutionContext, type RiskContext, type DatabaseContext } from '../../utils/logger.js';
import { validationOrchestrator, type TradeValidationResult } from '../../utils/validation.js';
import { prisma } from '../../db.js';
import { logCompletedTrade } from './execution.js';
import { expectancyManager, TradeOutcome } from './expectancyManager.js';
import { MarketRegimeDetector } from './marketRegimeDetector.js';
import { assetOptimizer } from './assetOptimizer.js';
import { DatabaseManager } from '../../utils/databaseManager.js';

// Create enhanced logger
const logger = createLogger('assetAgent');

// Global portfolio risk manager instance
let portfolioRisk: PortfolioRiskManager | null = null;
// Global collection of all agent instances
const allAgents = new Map<string, AssetAgent>();

// Define TradeIdea type to match what executeIdea expects
type TradeIdea = {
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  reason?: string;
  stop?: number;
  target?: number;
};

// Type for decision output that can include a 'hold' action
type Decision = TradeIdea | {
  symbol: string;
  action: 'hold';
  reason: string;
};

export class AssetAgent {
  symbol: string;
  perception: Perception;
  risk: RiskManager;
  cfg: Config;
  indCache: Indicators.Default;
  strategies: BaseStrategy[] = [];
  private dataFeed: DataFeed;
  private executionEngine: ExecutionEngine;
  private tickHandler: (tick: Tick) => void;
  
  // 5-minute optimization: Trade frequency controls
  private lastTradeTime: number = 0;
  private tradesThisHour: number = 0;
  private hourlyTradeReset: number = 0;
  
  private regimeDetector: MarketRegimeDetector;
  private currentRegime: any = null;
  private regimeUpdateInterval = 5; // Update regime every 5 candles
  private candleCount = 0;
  
  constructor(
    symbol: string, 
    cfg: Config, 
    botId: number, 
    versionId: number,
    dataFeed?: DataFeed,
    executionEngine?: ExecutionEngine
  ) {
    this.symbol = symbol;
    this.cfg = cfg; // Initialize temporarily - will be updated after optimization loading
    this.perception = new Perception();
    this.risk = new RiskManager(botId, cfg);
    this.indCache = new Indicators.Default();
    
    // store versionId inside risk for trade logging
    (this.risk as any).versionId = versionId;
    
    // Set execution engine (default to SimEngine if not provided)
    this.executionEngine = executionEngine || new SimEngine(botId);
    
    // Set data feed (will be set later if not provided)
    this.dataFeed = dataFeed as DataFeed;
    
    // Create tick handler for data feed
    this.tickHandler = (tick: Tick) => {
      this.onTick(tick.price, tick.timestamp);
    };
    
    // Subscribe to data feed if provided
    if (dataFeed) {
      dataFeed.subscribe(symbol, this.tickHandler);
    }
    
    // Use global strategy toggles directly instead of per-symbol toggles
    // Initialize strategies based on configuration
    if (cfg.strategyToggle.SMCReversal !== false) { // Default to true if not specified
      this.strategies.push(new SMCReversal(symbol));
    }
    
    if (cfg.strategyToggle.TrendFollowMA === true) {
      this.strategies.push(new TrendFollowMA(symbol));
    }
    
    if (cfg.strategyToggle.RangeBounce === true) {
      this.strategies.push(new RangeBounce(symbol));
    }
    
    if (cfg.strategyToggle.MomentumScalp === true) {
      this.strategies.push(new MomentumScalp(symbol));
    }
    
    logger.info(`Initialized strategies for ${symbol}: ${this.strategies.map(s => s.constructor.name).join(', ')}`, { 
      symbol,
      strategiesCount: this.strategies.length,
      strategyNames: this.strategies.map(s => s.constructor.name)
    });
    
    // Register this agent in the global collection
    allAgents.set(symbol, this);
    
    // Initialize portfolio risk manager if not already done
    if (!portfolioRisk) {
      portfolioRisk = new PortfolioRiskManager();
      portfolioRisk.init().catch(err => 
        logger.error(`Failed to initialize portfolio risk manager`, { error: err, symbol })
      );
    }

    this.regimeDetector = new MarketRegimeDetector();
    this.loadStrategies();
  }

  /**
   * Initialize the agent with optimized configuration
   * This must be called after construction and before trading begins
   */
  async initialize(): Promise<void> {
    logger.info(`🔧 AGENT INIT: Initializing AssetAgent for ${this.symbol}`, {
      symbol: this.symbol,
      phase: 'initialization'
    });

    try {
      // Load optimized configuration
      const originalConfig = this.cfg;
      const optimizedConfig = await assetOptimizer.getOptimizedConfig(this.symbol, originalConfig);
      
      // Only update if optimization changed something
      if (optimizedConfig !== originalConfig) {
        this.cfg = optimizedConfig;
        
        // Update risk manager with new config
        const currentBotId = (this.risk as any).botId;
        const currentVersionId = (this.risk as any).versionId;
        this.risk = new RiskManager(currentBotId, optimizedConfig);
        (this.risk as any).versionId = currentVersionId; // Preserve version ID
        
        logger.info(`✅ AGENT INIT: Configuration optimized for ${this.symbol}`, {
          symbol: this.symbol,
          riskPct: optimizedConfig.riskPct,
          strategiesEnabled: Object.entries(optimizedConfig.strategyToggle)
            .filter(([_, enabled]) => enabled)
            .map(([name, _]) => name)
        });
      } else {
        logger.info(`ℹ️ AGENT INIT: No optimization needed for ${this.symbol}`, {
          symbol: this.symbol
        });
      }
    } catch (error) {
      logger.error(`❌ AGENT INIT: Failed to initialize optimized config for ${this.symbol}`, {
        symbol: this.symbol,
        error: error instanceof Error ? error.message : String(error)
      });
      // Keep using base config if optimization fails
    }
  }

  // Method to set data feed after construction
  setDataFeed(dataFeed: DataFeed): void {
    // Unsubscribe from previous feed if exists
    if (this.dataFeed) {
      // Note: DataFeed interface doesn't have unsubscribe method,
      // but ideally we would unsubscribe here
    }
    
    this.dataFeed = dataFeed;
    dataFeed.subscribe(this.symbol, this.tickHandler);
  }
  
  // Method to set execution engine after construction
  setExecutionEngine(executionEngine: ExecutionEngine): void {
    this.executionEngine = executionEngine;
  }

  async onTick(price: number, ts: number) {
    this.perception.addTick(price, ts);
    this.risk.updateAllStops();
    
    // Get the last 2 candles for stop calculation
    const lastCandles = this.perception.last(2);
    if (lastCandles.length < 2) {
      logger.debug(`${this.symbol.toUpperCase()}: Not enough data yet, need at least 2 candles`, {
        symbol: this.symbol,
        candleCount: lastCandles.length,
        price,
        timestamp: ts
      });
      return; // Need at least 2 candles
    }
  }
  
  async onCandleClose(candle: Candle) {
    // Update the candle in perception
    this.perception.onCandleClose(candle);
    
    // Update indicator cache
    this.indCache.updateOnClose(candle.c);
    
    // Update market regime detection periodically
    this.candleCount++;
    if (this.candleCount % this.regimeUpdateInterval === 0) {
      this.updateMarketRegime();
    }
    
    // ========================================
    // 🚪 EXIT MONITORING - Check existing positions first
    // ========================================
    if (this.risk.positions.length > 0) {
      const exitCheck = this.risk.checkExitConditions(candle.c);
      
      if (exitCheck.shouldExit && exitCheck.position && exitCheck.reason) {
        const position = exitCheck.position;
        const exitReason = exitCheck.reason === 'stop_loss' ? 'Stop-loss hit' : 'Take-profit hit';
        
        logger.info(`🚪 EXIT SIGNAL: ${exitReason} for ${this.symbol.toUpperCase()} | Position: ${position.side.toUpperCase()} ${position.qty} @ $${position.entry.toFixed(2)} | Current: $${candle.c.toFixed(2)}`, {
          symbol: this.symbol,
          exitReason: exitCheck.reason,
          positionSide: position.side,
          positionQty: position.qty,
          entryPrice: position.entry,
          currentPrice: candle.c,
          stopPrice: position.stop,
          targetPrice: position.target,
          positionAge: position.entryTs ? Date.now() - position.entryTs : 0
        });
        
        try {
          // Close the position
          await this.closePositions(candle.c, exitCheck.reason);
          
          logger.info(`✅ EXIT EXECUTED: ${exitReason} successfully executed for ${this.symbol.toUpperCase()}`, {
            symbol: this.symbol,
            exitReason: exitCheck.reason,
            executionPrice: candle.c
          });
          
          // Return early - don't look for new entry signals when we just exited
          return;
          
        } catch (error) {
          logger.error(`❌ EXIT FAILED: Error executing ${exitReason} for ${this.symbol}`, {
            symbol: this.symbol,
            exitReason: exitCheck.reason,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      } else {
        // Update trailing stops for existing positions
        this.risk.updateAllStops();
        
        // Log position status every 10 candles for monitoring
        if (Math.floor(candle.ts / 1000) % 10 === 0) {
          const position = this.risk.positions[0];
          const unrealizedPnL = position.side === 'buy' 
            ? (candle.c - position.entry) * position.qty
            : (position.entry - candle.c) * position.qty;
            
          logger.debug(`📊 POSITION STATUS: ${this.symbol.toUpperCase()} | ${position.side.toUpperCase()} ${position.qty} @ $${position.entry.toFixed(2)} | Current: $${candle.c.toFixed(2)} | Unrealized P&L: $${unrealizedPnL.toFixed(2)}`, {
            symbol: this.symbol,
            positionSide: position.side,
            positionQty: position.qty,
            entryPrice: position.entry,
            currentPrice: candle.c,
            stopPrice: position.stop,
            targetPrice: position.target,
            unrealizedPnL,
            positionAge: position.entryTs ? Date.now() - position.entryTs : 0
          });
        }
      }
    }
    
    // Update portfolio risk metrics
    if (portfolioRisk) {
      portfolioRisk.recalc(allAgents);
      
      // Log portfolio risk status
      const portfolioData: PortfolioContext = {
        totalEquity: portfolioRisk.equity,
        totalPnL: portfolioRisk.dayPnl,
        openRisk: portfolioRisk.openRiskPct,
        positionCount: Array.from(allAgents.values()).reduce((count, agent) => count + agent.risk.positions.length, 0),
        canTrade: portfolioRisk.canTrade(),
        reason: portfolioRisk.canTrade() ? 'within_limits' : 'risk_limits_exceeded'
      };
      
      logger.logPortfolioRisk(this.symbol, portfolioData);
      
      // Check portfolio-wide risk limits with comprehensive analysis
      if (!portfolioRisk.canTrade(allAgents)) {
        const riskSummary = portfolioRisk.getRiskSummary(allAgents);
        logger.warn(
          'VETO-PORTFOLIO limits exceeded - Enhanced risk analysis',
          { 
            symbol: this.symbol,
            riskLevel: riskSummary.riskLevel,
            canTrade: riskSummary.canTrade,
            breachCount: riskSummary.breachCount,
            warningCount: riskSummary.warningCount,
            checkId: riskSummary.checkId,
            openRisk: portfolioRisk.openRiskPct, 
            dayLoss: portfolioRisk.dayPnl < 0 ? Math.abs(portfolioRisk.dayPnl) / portfolioRisk.equity : 0 
          }
        );
        return;
      }
    }

    // Periodic pipeline health check (every 50 candles)
    if (Math.floor(candle.ts / 1000) % 50 === 0) {
      try {
        const healthCheck = await validationOrchestrator.checkHealth();
        if (healthCheck.overall === 'critical') {
          logger.error(`🚨 CRITICAL HEALTH ISSUE: Pipeline health check failed`, {
            symbol: this.symbol,
            overall: healthCheck.overall,
            summary: healthCheck.summary,
            criticalComponents: healthCheck.components.filter(c => c.status === 'critical').map(c => c.component)
          });
        } else if (healthCheck.overall === 'warning') {
          logger.warn(`⚠️ HEALTH WARNING: Pipeline health check shows warnings`, {
            symbol: this.symbol,
            overall: healthCheck.overall,
            summary: healthCheck.summary,
            warningComponents: healthCheck.components.filter(c => c.status === 'warning').map(c => c.component)
          });
        } else {
          logger.debug(`✅ HEALTH CHECK: Pipeline health is good`, {
            symbol: this.symbol,
            overall: healthCheck.overall,
            summary: healthCheck.summary
          });
        }
      } catch (healthError) {
        logger.error(`Health check failed`, {
          symbol: this.symbol,
          error: healthError instanceof Error ? healthError.message : String(healthError)
        });
      }
    }
    
    // Prepare strategy context
    const ctx = {
      perception: this.perception,
      ind: this.indCache,
      cfg: this.cfg,
      regime: this.currentRegime
    };
    
    // Get first non-null trade idea from strategies
    let tradeIdea: any = null;
    logger.info(`🔍 STRATEGY CHECK: Testing ${this.strategies.length} strategies for ${this.symbol}`, {
      symbol: this.symbol,
      strategiesCount: this.strategies.length,
      price: candle.c,
      timestamp: candle.ts
    });
    
    for (let i = 0; i < this.strategies.length; i++) {
      const strategy = this.strategies[i];
      const idea = strategy.onCandle(candle, ctx);
      const strategyName = strategy.constructor.name;
      
      if (idea) {
                 // Generate trade ID and log signal
         const tradeId = logger.logTradeSignal(
           this.symbol,
           idea.side,
           candle.c,
           strategyName,
           idea.reason || 'Strategy signal',
           {
             versionId: (this.risk as any).versionId
           }
         );
        
        // Store trade ID and strategy name in the idea for tracking
        tradeIdea = { ...idea, tradeId, strategyName };
        break;
      } else {
        logger.debug(`⚪ NO SIGNAL: ${strategyName} returned null for ${this.symbol}`, {
          symbol: this.symbol,
          strategy: strategyName,
          price: candle.c
        });
      }
    }

    // If no trade idea, return
    if (!tradeIdea) {
      logger.debug(`DECISION: HOLD ${this.symbol.toUpperCase()} @ $${candle.c.toFixed(2)} | No trade signals from any strategy`, {
        symbol: this.symbol,
        price: candle.c,
        decision: 'HOLD'
      });
      return;
    }

    // ========================================
    // 🛡️ POSITION SIZE CONTROLS - Prevent over-accumulation
    // ========================================
    if (this.risk.positions.length > 0) {
      const existingPosition = this.risk.positions[0];
      
      // Check if trying to add to existing position in same direction
      if (existingPosition.side === tradeIdea.side) {
        logger.warn(`🚨 BLOCKED: Position accumulation prevented for ${this.symbol.toUpperCase()} | Already have ${existingPosition.side.toUpperCase()} position of ${existingPosition.qty} shares`, {
          tradeId: tradeIdea.tradeId,
          symbol: this.symbol,
          existingPositionSide: existingPosition.side,
          existingPositionQty: existingPosition.qty,
          newSignalSide: tradeIdea.side,
          reason: 'position_accumulation_prevention'
        });
        return;
      }
      
      // Check if trying to reverse position (this would close existing and open new)
      if (existingPosition.side !== tradeIdea.side) {
        logger.info(`🔄 POSITION REVERSAL: ${this.symbol.toUpperCase()} signal would reverse existing ${existingPosition.side.toUpperCase()} position to ${tradeIdea.side.toUpperCase()}`, {
          tradeId: tradeIdea.tradeId,
          symbol: this.symbol,
          existingPositionSide: existingPosition.side,
          newSignalSide: tradeIdea.side,
          reason: 'position_reversal_detected'
        });
        
        // For now, block reversal trades - could be enhanced to allow them
        logger.warn(`🚨 BLOCKED: Position reversal blocked for ${this.symbol.toUpperCase()} | Close existing position first`, {
          tradeId: tradeIdea.tradeId,
          symbol: this.symbol,
          reason: 'position_reversal_prevention'
        });
        return;
      }
    }

    // Gatekeeper check
    let rlEntryId: number | null = null;
    try {
      const scoreResult = await gate.scoreIdea({
        symbol: this.symbol,
        price: candle.c,
        rsi: this.indCache.rsi14,
        adx: this.indCache.adx14,
        volatility: this.indCache.bbWidth,
        recentTrend: (this.indCache.fastMA - this.indCache.slowMA) / candle.c,
        dayOfWeek: new Date().getDay(),
        hourOfDay: new Date().getHours(),
      }, tradeIdea.side);
      
      if (scoreResult.score < this.cfg.gatekeeperThresh) {
        logger.info(`🚨 BLOCKED: Trade blocked by RL Gatekeeper for ${this.symbol.toUpperCase()}: Score ${scoreResult.score.toFixed(4)} below threshold ${this.cfg.gatekeeperThresh}`, {
          tradeId: tradeIdea.tradeId,
          symbol: this.symbol,
          score: scoreResult.score,
          threshold: this.cfg.gatekeeperThresh,
          reason: 'gatekeeper_veto'
        });
        return;
      }
      rlEntryId = scoreResult.id;
      logger.info(`✅ APPROVED: Trade approved by RL Gatekeeper for ${this.symbol.toUpperCase()} (Score: ${scoreResult.score.toFixed(4)}, EntryId: ${rlEntryId})`, {
        tradeId: tradeIdea.tradeId,
        symbol: this.symbol,
        score: scoreResult.score,
        entryId: rlEntryId
      });
      
      if (scoreResult.id && scoreResult.id > 0) {
        storeRLEntryId(this.symbol, Date.now(), scoreResult.id);
      }
    } catch (error) {
      logger.error(`RL Gatekeeper error for ${this.symbol}`, { 
        tradeId: tradeIdea.tradeId,
        symbol: this.symbol,
        error: error instanceof Error ? error.message : String(error)
      });
      return;
    }

    // Proceed with trade execution logic...
    const R_MULT = 0.5;
    const side = tradeIdea.side;
    const entry = candle.c;

    // ========================================
    // 🎯 ENHANCED STOP-LOSS/TAKE-PROFIT MECHANISMS
    // ========================================
    const atr = this.indCache.atr14 || 0;
    let stopPrice: number;
    let targetPrice: number;
    let usingATR = false;
    let stopMethod = 'unknown';

    // Enhanced ATR-based calculations with multiple fallback methods
    if (atr > 0 && !isNaN(atr)) {
      // ✅ PRIMARY: ATR-based dynamic stops
      const volatilityFactor = Math.min(Math.max(atr / entry, 0.005), 0.02); // 0.5% to 2% max
      const adaptiveMultiplier = volatilityFactor > 0.015 ? 0.8 : 1.2; // Tighter stops in high volatility
      
      stopPrice = side === 'buy'
        ? entry - (atr * R_MULT * adaptiveMultiplier)
        : entry + (atr * R_MULT * adaptiveMultiplier);

      // Dynamic target based on market conditions
      const trendStrength = Math.abs((this.indCache.fastMA - this.indCache.slowMA) / entry);
      const targetMultiplier = trendStrength > 0.01 ? 3.0 : 2.5; // Wider targets in strong trends
      
      targetPrice = side === 'buy'
        ? entry + (atr * R_MULT * targetMultiplier)
        : entry - (atr * R_MULT * targetMultiplier);

      usingATR = true;
      stopMethod = 'atr_adaptive';
      
      logger.info(`🎯 ENHANCED ATR LEVELS: Entry=${entry.toFixed(2)}, Stop=${stopPrice.toFixed(2)}, Target=${targetPrice.toFixed(2)} | ATR=${atr.toFixed(4)}, VolFactor=${volatilityFactor.toFixed(4)}, TrendStrength=${trendStrength.toFixed(4)}, AdaptiveMult=${adaptiveMultiplier.toFixed(2)}, TargetMult=${targetMultiplier.toFixed(2)}`, {
        tradeId: tradeIdea.tradeId,
        symbol: this.symbol,
        entry, stopPrice, targetPrice, atr, volatilityFactor, trendStrength, adaptiveMultiplier, targetMultiplier
      });
      
    } else {
      // ✅ FALLBACK 1: Support/Resistance based stops
      const recentCandles = this.perception.last(10);
      if (recentCandles && recentCandles.length >= 5) {
        const highs = recentCandles.map(c => c.h);
        const lows = recentCandles.map(c => c.l);
        const resistance = Math.max(...highs);
        const support = Math.min(...lows);
        
        stopPrice = side === 'buy' 
          ? Math.max(support * 0.995, entry * 0.985) // 0.5% below support or 1.5% below entry
          : Math.min(resistance * 1.005, entry * 1.015); // 0.5% above resistance or 1.5% above entry
          
        targetPrice = side === 'buy'
          ? resistance * 1.002 // Just above resistance
          : support * 0.998; // Just below support
          
        stopMethod = 'support_resistance';
        
        logger.info(`📊 SUPPORT/RESISTANCE LEVELS: Entry=${entry.toFixed(2)}, Stop=${stopPrice.toFixed(2)}, Target=${targetPrice.toFixed(2)} | Support=${support.toFixed(2)}, Resistance=${resistance.toFixed(2)}`, {
          tradeId: tradeIdea.tradeId,
          symbol: this.symbol,
          entry, stopPrice, targetPrice, support, resistance
        });
        
      } else {
        // ✅ FALLBACK 2: Enhanced percentage-based with volatility estimation
        const recentPrices = this.perception.last(5).map(c => c.c);
        const volatility = recentPrices.length > 1 
          ? Math.sqrt(recentPrices.reduce((sum, price, i) => {
              if (i === 0) return 0;
              const change = (price - recentPrices[i-1]) / recentPrices[i-1];
              return sum + change * change;
            }, 0) / (recentPrices.length - 1))
          : 0.01; // Default 1% volatility
          
        const stopPct = Math.max(volatility * 1.5, 0.008); // At least 0.8% stop
        const targetPct = stopPct * 2.5; // 2.5:1 reward-to-risk
        
        stopPrice = side === 'buy' 
          ? entry * (1 - stopPct)
          : entry * (1 + stopPct);
          
        targetPrice = side === 'buy'
          ? entry * (1 + targetPct)
          : entry * (1 - targetPct);
          
        stopMethod = 'volatility_percentage';
        
        logger.info(`📈 VOLATILITY-BASED LEVELS: Entry=${entry.toFixed(2)}, Stop=${stopPrice.toFixed(2)}, Target=${targetPrice.toFixed(2)} | EstVol=${(volatility*100).toFixed(2)}%, StopPct=${(stopPct*100).toFixed(2)}%, TargetPct=${(targetPct*100).toFixed(2)}%`, {
          tradeId: tradeIdea.tradeId,
          symbol: this.symbol,
          entry, stopPrice, targetPrice, volatility, stopPct, targetPct
        });
      }
      
      usingATR = false;
      
      logger.warn(`⚠️ ATR FALLBACK: ATR=${atr} for ${this.symbol}, using ${stopMethod} method`, {
        tradeId: tradeIdea.tradeId,
        symbol: this.symbol,
        atr,
        fallbackMethod: stopMethod
      });
    }
    
    // ========================================
    // 🎯 ENHANCED POSITION SIZING
    // ========================================
    // Calculate signal confidence based on multiple factors
    const rsi = this.indCache.rsi14 || 50;
    const adx = this.indCache.adx14 || 25;
    
    // Confidence factors (0-1 scale)
    const trendConfidence = Math.min(1.0, Math.max(0.3, adx / 50)); // Strong trend = higher confidence
    const momentumConfidence = side === 'buy' 
      ? Math.min(1.0, Math.max(0.3, (100 - rsi) / 50)) // Oversold for buys
      : Math.min(1.0, Math.max(0.3, rsi / 50)); // Overbought for sells
    const volatilityConfidence = usingATR ? 1.0 : 0.7; // Lower confidence without ATR
    
    // Combined confidence score
    const overallConfidence = (trendConfidence + momentumConfidence + volatilityConfidence) / 3;
    
    // Get base position size from risk manager
    const baseQty = this.risk.sizeTrade(stopPrice, entry, this.symbol, overallConfidence);
    
    // Apply dynamic position sizing after RR check (will be updated later with regime info)
    // For now, use base quantity - dynamic sizing will be applied after RR check
    const qty = baseQty;
    
    logger.info(`📊 POSITION SIZING: ${this.symbol.toUpperCase()} | Qty=${qty.toFixed(6)}, Confidence=${(overallConfidence*100).toFixed(1)}% | Trend=${(trendConfidence*100).toFixed(1)}%, Momentum=${(momentumConfidence*100).toFixed(1)}%, Vol=${(volatilityConfidence*100).toFixed(1)}%`, {
      tradeId: tradeIdea.tradeId,
      symbol: this.symbol,
      qty: qty,
      overallConfidence: overallConfidence,
      trendConfidence: trendConfidence,
      momentumConfidence: momentumConfidence,
      volatilityConfidence: volatilityConfidence,
      rsi: rsi,
      adx: adx,
      usingATR: usingATR
    });
    
    // Prepare full trade idea
    const fullIdea: TradeIdea & { stop: number; target: number } = {
      symbol: this.symbol,
      side: tradeIdea.side,
      price: candle.c,
      qty,
      stop: stopPrice,
      target: targetPrice
    };
    
    // Check dynamic risk-reward ratio based on recent performance
    logger.info(`🎯 RR CHECK: About to check RR for ${side} ${this.symbol} | Entry=${candle.c.toFixed(2)}, Stop=${stopPrice.toFixed(2)}, Target=${targetPrice.toFixed(2)}, UsingATR=${usingATR}`, {
      tradeId: tradeIdea.tradeId,
      symbol: this.symbol,
      side,
      entry: candle.c,
      stopPrice,
      targetPrice,
      usingATR
    });
    
    // ========================================
    // 🎯 EXPECTANCY-BASED TRADE FILTERING
    // ========================================
    
    // Check if strategy has positive expectancy before proceeding
    const expectancyCheck = expectancyManager.shouldAllowTrade(
      tradeIdea.strategyName || 'unknown',
      this.symbol
    );
    
    if (!expectancyCheck.allowed) {
      logger.info("🚫 EXPECTANCY FILTER: Trade blocked due to negative expectancy", {
        strategy: tradeIdea.strategyName,
        symbol: this.symbol,
        reason: expectancyCheck.reason,
        expectancy: expectancyCheck.expectancy?.toFixed(4),
        confidence: expectancyCheck.confidence?.toFixed(2),
        sampleSize: expectancyCheck.sampleSize
      });
      return null;
    }
    
    // Log expectancy approval for monitoring
    if (expectancyCheck.expectancy !== undefined) {
      logger.debug("✅ EXPECTANCY FILTER: Trade approved", {
        strategy: tradeIdea.strategyName,
        symbol: this.symbol,
        expectancy: expectancyCheck.expectancy.toFixed(4),
        confidence: expectancyCheck.confidence?.toFixed(2),
        sampleSize: expectancyCheck.sampleSize,
        reason: expectancyCheck.reason
      });
    }

    // Calculate market condition factors for enhanced RR analysis
    const marketVolatility = atr / candle.c; // ATR as percentage of price
    const trendStrength = Math.abs((this.indCache.fastMA - this.indCache.slowMA) / candle.c);
    
    // Enhanced strategy-specific risk-reward with market condition adaptation
    const { passRRDynamic, getDynamicPositionSize } = await import('./utils/riskReward.js');
    
    // Get regime-adjusted parameters
    let regimeAdjustments = { rrMultiplier: 1.0, positionSizeMultiplier: 1.0 };
    if (this.currentRegime) {
      regimeAdjustments = this.regimeDetector.getRegimeAdjustments(
        this.currentRegime.regime,
        this.currentRegime.confidence,
        tradeIdea.strategyName || 'default'
      );
    }
    
    // Use strategy-specific RR check with market conditions and regime adjustments
    const rrResult = await passRRDynamic(
      side,
      candle.c,
      stopPrice,
      targetPrice,
      this.symbol,
      marketVolatility * regimeAdjustments.rrMultiplier, // Apply regime adjustment
      trendStrength,
      tradeIdea.strategyName || 'default'
    );
    const stopDistance = Math.abs(candle.c - stopPrice);
    const targetDistance = Math.abs(targetPrice - candle.c);
    
    // Log risk check with structured data
    const riskData: RiskContext = {
      tradeId: tradeIdea.tradeId,
      symbol: this.symbol,
      currentPrice: candle.c,
      stopPrice,
      targetPrice,
      riskReward: rrResult.rr,
      threshold: rrResult.threshold,
      atr,
      positionSize: qty,
      passed: rrResult.passed,
      reason: rrResult.passed ? 'above_threshold' : 'below_threshold'
    };
    
    logger.logRiskCheck(riskData);
    
    // Enhanced RR logging with detailed breakdown including market regime
    logger.info(`🎯 REGIME-AWARE RR: ${this.symbol.toUpperCase()} [${rrResult.adjustments.strategyName}] [${rrResult.adjustments.regime.toUpperCase()}:${(rrResult.adjustments.regimeConfidence*100).toFixed(0)}%] | RR=${rrResult.rr.toFixed(3)}, Threshold=${rrResult.threshold.toFixed(2)}, WinRate=${(rrResult.winProb*100).toFixed(1)}% | Base=${rrResult.adjustments.baseThreshold.toFixed(2)}, RegimeMult=${rrResult.adjustments.regimeMultiplier.toFixed(2)}, VolAdj=${rrResult.adjustments.volatilityAdjustment.toFixed(2)} | ${rrResult.passed ? '✅ PASSED' : '❌ BLOCKED'}`, {
      tradeId: tradeIdea.tradeId,
      symbol: this.symbol,
      riskReward: rrResult.rr,
      threshold: rrResult.threshold,
      winProb: rrResult.winProb,
      baseThreshold: rrResult.adjustments.baseThreshold,
      volatilityAdjustment: rrResult.adjustments.volatilityAdjustment,
      trendAdjustment: rrResult.adjustments.trendAdjustment,
      marketVolatility: marketVolatility,
      trendStrength: trendStrength,
      passed: rrResult.passed
    });
    
    if (!rrResult.passed) {
      logger.info(`🚨 BLOCKED: Risk-reward ratio ${rrResult.rr.toFixed(3)} below adaptive threshold ${rrResult.threshold.toFixed(2)} for ${this.symbol.toUpperCase()} | Win rate: ${(rrResult.winProb*100).toFixed(1)}%`, {
        tradeId: tradeIdea.tradeId,
        symbol: this.symbol,
        riskReward: rrResult.rr,
        threshold: rrResult.threshold,
        winProb: rrResult.winProb,
        reason: 'rr_below_adaptive_threshold'
      });
      
      // Persist the blocked trade to the database with enhanced error handling and transaction
      try {
        await DatabaseManager.withTransaction(async (tx) => {
          await tx.rLDataset.create({
            data: {
              symbol: this.symbol,
              featureVec: JSON.stringify({
                symbol: this.symbol,
                price: candle.c,
                rsi: this.indCache.rsi14,
                adx: this.indCache.adx14,
                volatility: this.indCache.bbWidth,
                recentTrend: (this.indCache.fastMA - this.indCache.slowMA) / candle.c,
                dayOfWeek: new Date().getDay(),
                hourOfDay: new Date().getHours(),
                winProb: rrResult.winProb,
                rrThreshold: rrResult.threshold,
                actualRR: rrResult.rr,
                manualRR: rrResult.rr,
                usingATR: usingATR,
                atrValue: atr,
                stopDistance: stopDistance,
                targetDistance: targetDistance
              }),
              action: 'blocked_rr',
              outcome: 0,
              strategyVersionId: (this.risk as any).versionId
            }
          });
        }, 'log_blocked_trade', tradeIdea.tradeId);
      } catch (error) {
        logger.error('Failed to log blocked trade to database', { 
          tradeId: tradeIdea.tradeId,
          symbol: this.symbol, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
      
      return;
    }
    
    // ========================================
    // 🎯 DYNAMIC POSITION SIZING AFTER RR APPROVAL
    // ========================================
    
    // Apply dynamic position sizing based on market regime and strategy confidence
    const dynamicQty = getDynamicPositionSize(
      baseQty,
      tradeIdea.strategyName || 'default',
      rrResult.adjustments.regime,
      rrResult.adjustments.regimeConfidence,
      rrResult.winProb,
      rrResult.rr,
      marketVolatility
    );
    
    // Update the trade idea with dynamic quantity
    fullIdea.qty = dynamicQty;
    
    logger.info(`📊 DYNAMIC SIZING: ${this.symbol.toUpperCase()} [${rrResult.adjustments.regime.toUpperCase()}] | Base=${baseQty.toFixed(6)} → Dynamic=${dynamicQty.toFixed(6)} (${((dynamicQty/baseQty)*100).toFixed(1)}%) | Strategy=${tradeIdea.strategyName}, WinRate=${(rrResult.winProb*100).toFixed(1)}%, RR=${rrResult.rr.toFixed(2)}`, {
      tradeId: tradeIdea.tradeId,
      symbol: this.symbol,
      baseQty,
      dynamicQty,
      sizeMultiplier: dynamicQty / baseQty,
      regime: rrResult.adjustments.regime,
      strategyName: tradeIdea.strategyName,
      winProb: rrResult.winProb,
      rrRatio: rrResult.rr
    });
    
    // ========================================
    // 🚦 5-MINUTE TRADE FREQUENCY CONTROLS
    // ========================================
    const currentTime = Date.now();
    const currentHour = Math.floor(currentTime / (60 * 60 * 1000));
    
    // Reset hourly trade counter if we're in a new hour
    if (currentHour !== this.hourlyTradeReset) {
      this.tradesThisHour = 0;
      this.hourlyTradeReset = currentHour;
    }
    
    // Check cooldown period - shorter cooldown for backtests to prevent rapid losses
    const cooldownMinutes = (process.env.MODE === 'backtest' || process.env.NODE_ENV === 'test') ? 
      5 : // 5 minutes for backtests - prevents rapid cascade failures
      (this.cfg.cooldownMinutes || 15); // 15 minutes for live trading
      
    const cooldownMs = cooldownMinutes * 60 * 1000;
    if (currentTime - this.lastTradeTime < cooldownMs) {
      const remainingCooldown = Math.ceil((cooldownMs - (currentTime - this.lastTradeTime)) / 60000);
      logger.info(`🚦 COOLDOWN: Trade blocked for ${this.symbol.toUpperCase()}, ${remainingCooldown} minutes remaining`, {
        tradeId: tradeIdea.tradeId,
        symbol: this.symbol,
        remainingCooldown: remainingCooldown,
        reason: 'cooldown_period',
        mode: process.env.MODE || 'live'
      });
      return;
    }
    
    // Check hourly trade limit - higher limit for backtests but still enforce some control
    const maxTradesPerHour = (process.env.MODE === 'backtest' || process.env.NODE_ENV === 'test') ?
      15 : // 15 trades/hour for backtests - allows decent volume but prevents bursts
      (this.cfg.maxTradesPerHour || 8); // 8 trades/hour for live trading
      
    if (this.tradesThisHour >= maxTradesPerHour) {
      logger.info(`🚦 HOURLY LIMIT: Trade blocked for ${this.symbol.toUpperCase()}, ${this.tradesThisHour}/${maxTradesPerHour} trades this hour`, {
        tradeId: tradeIdea.tradeId,
        symbol: this.symbol,
        tradesThisHour: this.tradesThisHour,
        maxTradesPerHour: maxTradesPerHour,
        reason: 'hourly_limit_reached',
        mode: process.env.MODE || 'live'
      });
      return;
    }
    
    // Execute trade idea with enhanced error handling and transaction management
    logger.info(`EXECUTING: ${tradeIdea.side.toUpperCase()} ${dynamicQty.toFixed(6)} ${this.symbol.toUpperCase()} @ $${candle.c.toFixed(2)} | Trade ${this.tradesThisHour + 1}/${maxTradesPerHour} this hour`, {
      tradeId: tradeIdea.tradeId,
      symbol: this.symbol,
      side: tradeIdea.side,
      qty: dynamicQty,
      price: candle.c,
      tradesThisHour: this.tradesThisHour,
      maxTradesPerHour: maxTradesPerHour
    });
    
    const executionStartTs = Date.now();
    
    try {
      // Create execution order
      const order: Order = {
        symbol: this.symbol,
        side: tradeIdea.side,
        type: 'market',
        qty: qty,
        price: candle.c
      };
      
      // Log order placement
      const executionData: ExecutionContext = {
        tradeId: tradeIdea.tradeId,
        symbol: this.symbol,
        side: tradeIdea.side,
        qty,
        price: candle.c,
        exchange: this.executionEngine.constructor.name
      };
      
      logger.logOrderPlacement(executionData);
      
      // Execute the order with retry logic
      const fill = await this.executeWithRetry(order, 3, tradeIdea.tradeId);

      if (fill) {
        // Log successful execution
        logger.logOrderExecution({
          ...executionData,
          success: true,
          fillPrice: fill.price,
          fillQty: fill.qty,
          fee: fill.fee,
          executionTime: Date.now() - executionStartTs
        });
        
        // Use transaction to ensure atomic operation of all post-execution updates
        await DatabaseManager.withTransaction(async (tx) => {
          // Register order with risk manager (this might update database)
          this.risk.registerOrder(fill.side, fill.qty, fill.price, stopPrice, targetPrice, this.symbol);

          // Update RL outcome if we have an entry ID
          if (rlEntryId) {
            await gate.updateOutcome(rlEntryId, 0);
          }

          // Explicitly log the completed trade entry
          const completedTradeData = {
            symbol: this.symbol,
            side: fill.side,
            price: fill.price,
            qty: fill.qty,
            reason: tradeIdea.reason || 'strategy_signal',
            exitReason: 'entry', // This is the entry, exit will be handled elsewhere
            pnl: 0, // Entry PnL is 0, will be updated on exit
            entryTs: executionStartTs
          };

          await logCompletedTrade(
            completedTradeData,
            'hypertrades', // Bot name
            (this.risk as any).versionId
          );
          
          // Validate trade execution
          const validationResult = await validationOrchestrator.validateExecution(
            tradeIdea.tradeId || 'unknown',
            this.symbol,
            fill.side,
            fill.qty,
            fill.price,
            {
              shouldBeRecorded: true,
              expectedPnL: 0, // Entry trade has 0 PnL
              expectedFee: fill.fee || 0
            }
          );

          if (!validationResult.success) {
            logger.warn(`⚠️ VALIDATION WARNING: Trade validation failed for entry`, {
              tradeId: tradeIdea.tradeId,
              validationId: validationResult.validationId,
              checks: validationResult.checks,
              message: validationResult.message
            });
          } else {
            logger.info(`✅ VALIDATION: Trade validation passed for entry`, {
              tradeId: tradeIdea.tradeId,
              validationId: validationResult.validationId
            });
          }
          
          // Log trade lifecycle event
          logger.logTradeLifecycle('ENTRY', {
            tradeId: tradeIdea.tradeId,
            symbol: this.symbol,
            side: fill.side,
            qty: fill.qty,
            price: fill.price,
            reason: tradeIdea.reason,
            strategyName: 'hypertrades',
            versionId: (this.risk as any).versionId
          });

          logger.info(`✅ TRADE LOGGED: Entry recorded for ${fill.side.toUpperCase()} ${fill.qty.toFixed(6)} ${this.symbol} @ $${fill.price.toFixed(2)}`, {
            tradeId: tradeIdea.tradeId,
            symbol: this.symbol,
            side: fill.side,
            qty: fill.qty,
            price: fill.price
          });
        }, 'execute_trade_complete', tradeIdea.tradeId);

        // Update trade frequency counters after successful execution
        this.lastTradeTime = Date.now();
        this.tradesThisHour++;

        logger.info(`COMPLETED: ${order.side.toUpperCase()} ${fill.qty.toFixed(6)} ${this.symbol.toUpperCase()} @ $${fill.price.toFixed(2)} | PnL: $${this.risk.dayPnL.toFixed(2)} | Trades this hour: ${this.tradesThisHour}/${this.cfg.maxTradesPerHour || 8}`, {
          tradeId: tradeIdea.tradeId,
          symbol: this.symbol,
          side: order.side,
          qty: fill.qty,
          price: fill.price,
          totalPnL: this.risk.dayPnL,
          tradesThisHour: this.tradesThisHour,
          maxTradesPerHour: this.cfg.maxTradesPerHour || 8
        });
      } else {
        logger.warn(`No fill received for order: ${order.side} ${order.qty} ${order.symbol}`, {
          tradeId: tradeIdea.tradeId,
          symbol: this.symbol,
          side: order.side,
          qty: order.qty
        });
        
        // Log failed execution
        logger.logOrderExecution({
          ...executionData,
          success: false,
          executionTime: Date.now() - executionStartTs
        });
      }
    } catch (error) {
      logger.error(`Error executing trade`, { 
        tradeId: tradeIdea.tradeId,
        error: error instanceof Error ? error.message : String(error), 
        symbol: this.symbol, 
        side: tradeIdea.side,
        executionTime: Date.now() - executionStartTs
      });
      
      // ========================================
      // 🧹 COMPREHENSIVE ERROR CLEANUP
      // ========================================
      
      try {
        // 1. Clean up risk manager state - ensure no phantom positions
        const originalPositionCount = this.risk.positions.length;
        this.risk.positions = this.risk.positions.filter(pos => {
          // Validate each position to ensure it's real
          if (!pos.entry || pos.entry <= 0 || !pos.qty || pos.qty <= 0) {
            logger.warn(`Removing invalid position during cleanup`, {
              tradeId: tradeIdea.tradeId,
              symbol: this.symbol,
              position: pos
            });
            return false;
          }
          return true;
        });
        
        if (this.risk.positions.length !== originalPositionCount) {
          logger.info(`🧹 CLEANUP: Removed ${originalPositionCount - this.risk.positions.length} invalid positions from risk manager`, {
            tradeId: tradeIdea.tradeId,
            symbol: this.symbol,
            originalCount: originalPositionCount,
            cleanedCount: this.risk.positions.length
          });
        }
        
        // 2. Reset trade frequency counters if error was due to rate limiting
        if (error instanceof Error && error.message.includes('rate limit')) {
          this.tradesThisHour = Math.max(0, this.tradesThisHour - 1);
          logger.info(`🧹 CLEANUP: Adjusted trade frequency counter due to rate limit error`, {
            tradeId: tradeIdea.tradeId,
            symbol: this.symbol,
            tradesThisHour: this.tradesThisHour
          });
        }
        
        // 3. Update expectancy manager with failed trade outcome
        if (tradeIdea.strategyName) {
          const failedOutcome = {
            strategyName: tradeIdea.strategyName,
            symbol: this.symbol,
            pnl: -Math.abs(qty * candle.c * 0.001), // Assume small loss from fees/slippage
            isWin: false,
            timestamp: new Date()
          };
          await expectancyManager.updateMetrics(failedOutcome);
          
          logger.debug(`🧹 CLEANUP: Updated expectancy manager with failed trade`, {
            tradeId: tradeIdea.tradeId,
            strategy: tradeIdea.strategyName,
            symbol: this.symbol
          });
        }
        
        // 4. Clear any pending trade signals or state
        logger.clearTradeId(this.symbol, tradeIdea.side);
        
        // 5. Validate portfolio risk manager state
        if (portfolioRisk) {
          portfolioRisk.recalc(allAgents); // Recalculate to ensure consistency
          
          if (!portfolioRisk.canTrade()) {
            logger.warn(`🧹 CLEANUP: Portfolio risk limits exceeded after error cleanup`, {
              tradeId: tradeIdea.tradeId,
              symbol: this.symbol,
              openRisk: portfolioRisk.openRiskPct,
              dayPnL: portfolioRisk.dayPnl
            });
          }
        }
        
        logger.info(`✅ CLEANUP: Error cleanup completed successfully`, {
          tradeId: tradeIdea.tradeId,
          symbol: this.symbol,
          error: 'execution_failed'
        });
        
      } catch (cleanupError) {
        logger.error(`❌ CLEANUP: Error during cleanup process`, {
          tradeId: tradeIdea.tradeId,
          symbol: this.symbol,
          originalError: error instanceof Error ? error.message : String(error),
          cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        });
      }
      
      // Log failed execution
      logger.logOrderExecution({
        tradeId: tradeIdea.tradeId,
        symbol: this.symbol,
        side: tradeIdea.side,
        qty,
        price: candle.c,
        success: false,
        executionTime: Date.now() - executionStartTs
      });
      
      // Log failed execution attempt to database for analysis
      try {
        await DatabaseManager.withRetry(async () => {
          await prisma.rLDataset.create({
            data: {
              symbol: this.symbol,
              featureVec: JSON.stringify({
                symbol: this.symbol,
                price: candle.c,
                error: error instanceof Error ? error.message : String(error),
                executionTime: Date.now() - executionStartTs,
                orderQty: qty,
                orderSide: tradeIdea.side,
                cleanupCompleted: true
              }),
              action: 'execution_failed',
              outcome: -1, // Negative outcome for failed execution
              strategyVersionId: (this.risk as any).versionId
            }
          });
        }, 'log_failed_execution', 3, tradeIdea.tradeId);
      } catch (dbError) {
        logger.error('Failed to log execution error to database', { 
          tradeId: tradeIdea.tradeId,
          dbError: dbError instanceof Error ? dbError.message : String(dbError) 
        });
      }
    }
  }
  
  /**
   * Execute an order with enhanced retry logic and database operations
   * @param order Order to execute
   * @param maxRetries Maximum number of retry attempts
   * @returns Promise resolving to order result
   */
  private async executeWithRetry(order: Order, maxRetries = 3, tradeId?: string): Promise<any> {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Verify database connection before attempting execution
        const isConnected = await DatabaseManager.verifyConnection();
        if (!isConnected) {
          throw new Error('Database connection failed before execution attempt');
        }

        // Attempt execution
        const result = await this.executionEngine.place(order);
        
        logger.debug(`Execution attempt ${attempt + 1} successful for ${order.side} ${order.symbol}`, {
          tradeId,
          symbol: order.symbol,
          side: order.side,
          attempt: attempt + 1,
          success: true
        });
        return result;
      } catch (error) {
        lastError = error;
        
        logger.warn(`Execution attempt ${attempt + 1}/${maxRetries} failed`, {
          tradeId,
          error: error instanceof Error ? error.message : String(error),
          symbol: order.symbol,
          side: order.side,
          attempt: attempt + 1,
          maxRetries
        });
        
        // Check if portfolio risk still allows trading
        if (portfolioRisk && !portfolioRisk.canTrade()) {
          logger.error('Portfolio risk limits exceeded, aborting execution', { tradeId });
          throw new Error('Portfolio risk limits exceeded, aborting execution');
        }
        
        if (attempt < maxRetries - 1) {
          // Exponential backoff with jitter
          const baseDelay = Math.pow(2, attempt) * 1000;
          const jitter = Math.random() * 500;
          const delay = baseDelay + jitter;
          
          logger.debug(`Retry attempt ${attempt + 2} for ${order.side} ${order.symbol} after ${delay}ms delay`, {
            tradeId,
            nextAttempt: attempt + 2,
            delay
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    logger.error(`All ${maxRetries} execution attempts failed for ${order.side} ${order.symbol}`, { 
      tradeId,
      lastError: lastError instanceof Error ? lastError.message : String(lastError),
      symbol: order.symbol,
      side: order.side
    });
    throw lastError;
  }
  
  /**
   * Close all open positions at current price with enhanced error handling
   * @param currentPrice Current market price
   * @param exitReason Optional reason for closing (stop_loss, take_profit, manual, etc.)
   * @returns Promise resolving to position close result
   */
  async closePositions(currentPrice: number, exitReason: string = 'manual'): Promise<void> {
    if (this.risk.positions.length === 0) {
      logger.debug(`No positions to close for ${this.symbol}`, { symbol: this.symbol });
      return;
    }

    const position = this.risk.positions[0];
    const positionQty = position.qty;
    const positionSide = position.side;
    const closeSide = positionSide === 'buy' ? 'sell' : 'buy';
    
    // Generate trade ID for position close
    const tradeId = logger.getCurrentTradeId(this.symbol, closeSide) || 
                   `close_${this.symbol}_${closeSide}_${Date.now()}`;
    
    const order: Order = {
      symbol: this.symbol,
      side: closeSide as 'buy' | 'sell',
      type: 'market',
      qty: Math.abs(positionQty),
      price: currentPrice
    };
    
    const closeStartTs = Date.now();
    
    try {
      // Log position close order placement
      logger.logOrderPlacement({
        tradeId,
        symbol: this.symbol,
        side: closeSide as 'buy' | 'sell',
        qty: Math.abs(positionQty),
        price: currentPrice,
        exchange: this.executionEngine.constructor.name
      });
      
      const result = await this.executeWithRetry(order, 3, tradeId);
      
      // Handle SimEngine response format: { id, symbol, side, qty, price, fee, timestamp, orderId }
      if (result && typeof result === 'object' && 'id' in result && 'price' in result && 'qty' in result) {
        const fill = result; // SimEngine returns the fill directly
        
        // Log successful close execution
        logger.logOrderExecution({
          tradeId,
          symbol: this.symbol,
          side: closeSide as 'buy' | 'sell',
          qty: Math.abs(positionQty),
          price: currentPrice,
          success: true,
          fillPrice: fill.price,
          fillQty: fill.qty,
          fee: fill.fee || 0,
          executionTime: Date.now() - closeStartTs
        });
        
        // Use transaction to ensure atomic position close and logging
        await DatabaseManager.withTransaction(async (tx) => {
          const tradePnL = await this.risk.closePosition(fill.qty, fill.price, fill.fee || 0);
          
          // Log the completed trade with exit information
          const completedTradeData = {
            symbol: this.symbol,
            side: closeSide,
            price: fill.price,
            qty: fill.qty,
            reason: 'position_close',
            exitReason: exitReason,
            pnl: tradePnL,
            entryTs: closeStartTs - 60000 // Fallback timestamp since Position doesn't track entry time
          };

          await logCompletedTrade(
            completedTradeData,
            'hypertrades',
            (this.risk as any).versionId
          );
          
          // Validate position close execution
          const validationResult = await validationOrchestrator.validateExecution(
            tradeId,
            this.symbol,
            closeSide as 'buy' | 'sell',
            fill.qty,
            fill.price,
            {
              shouldBeRecorded: true,
              expectedPnL: tradePnL,
              expectedFee: fill.fee || 0
            }
          );

          if (!validationResult.success) {
            logger.warn(`⚠️ VALIDATION WARNING: Trade validation failed for position close`, {
              tradeId,
              validationId: validationResult.validationId,
              checks: validationResult.checks,
              message: validationResult.message
            });
          } else {
            logger.info(`✅ VALIDATION: Trade validation passed for position close`, {
              tradeId,
              validationId: validationResult.validationId
            });
          }
          
          // Log trade lifecycle event
          logger.logTradeLifecycle('EXIT', {
            tradeId,
            symbol: this.symbol,
            side: closeSide,
            qty: fill.qty,
            price: fill.price,
            pnl: tradePnL,
            reason: 'position_close',
            strategyName: 'hypertrades',
            versionId: (this.risk as any).versionId
          });

          logger.info(`✅ POSITION CLOSED: ${closeSide.toUpperCase()} ${fill.qty.toFixed(6)} ${this.symbol} @ $${fill.price.toFixed(2)} | PnL: $${tradePnL.toFixed(2)}`, {
            tradeId,
            symbol: this.symbol,
            side: closeSide,
            qty: fill.qty,
            price: fill.price,
            pnl: tradePnL
          });
          
          // Update asset-specific performance and trigger auto-optimization
          try {
            const position = this.risk.positions.find(p => Math.abs(p.qty) === Math.abs(fill.qty));
            const riskReward = position ? Math.abs(fill.price - position.entry) / Math.abs(position.entry * 0.02) : 1.0;
            
            await assetOptimizer.updatePerformanceAndOptimize(this.symbol, {
              pnl: tradePnL,
              rr: riskReward,
              duration: Date.now() - closeStartTs
            });
          } catch (optimizationError) {
            logger.warn(`Failed to update asset optimization for ${this.symbol}`, {
              symbol: this.symbol,
              error: optimizationError instanceof Error ? optimizationError.message : String(optimizationError)
            });
          }
        }, 'close_position_complete', tradeId);
        
        // Clear the trade ID since trade is complete
        logger.clearTradeId(this.symbol, positionSide);
        
      } else {
        logger.warn(`Unexpected result format when closing position for ${this.symbol}`, { 
          tradeId,
          symbol: this.symbol,
          result: JSON.stringify(result) 
        });
      }
    } catch (error) {
      logger.error(`Error closing position`, { 
        tradeId,
        error: error instanceof Error ? error.message : String(error), 
        symbol: this.symbol, 
        positionQty, 
        positionSide,
        closeTime: Date.now() - closeStartTs
      });
      
      // Log failed close execution
      logger.logOrderExecution({
        tradeId,
        symbol: this.symbol,
        side: closeSide as 'buy' | 'sell',
        qty: Math.abs(positionQty),
        price: currentPrice,
        success: false,
        executionTime: Date.now() - closeStartTs
      });
      
      // Log failed position close to database
      try {
        await DatabaseManager.withRetry(async () => {
          await prisma.rLDataset.create({
            data: {
              symbol: this.symbol,
              featureVec: JSON.stringify({
                symbol: this.symbol,
                error: error instanceof Error ? error.message : String(error),
                closeTime: Date.now() - closeStartTs,
                positionQty,
                positionSide,
                currentPrice
              }),
              action: 'position_close_failed',
              outcome: -1,
              strategyVersionId: (this.risk as any).versionId
            }
          });
        }, 'log_failed_position_close', 3, tradeId);
      } catch (dbError) {
        logger.error('Failed to log position close error to database', { 
          tradeId,
          dbError: dbError instanceof Error ? dbError.message : String(dbError) 
        });
      }
    }
  }
  
  /**
   * Check if portfolio risk allows trading again after being halted
   */
  async checkRiskResumption(): Promise<void> {
    if (portfolioRisk && portfolioRisk.canTrade()) {
      logger.info(`Trading can resume - Portfolio risk metrics within limits`, {
        symbol: this.symbol,
        openRisk: portfolioRisk.openRiskPct,
        dayPnL: portfolioRisk.dayPnl
      });
    }
  }

  private updateMarketRegime(): void {
    if (this.perception.last(20).length < 20) return; // Need sufficient data

    // Get required indicators for regime detection
    const atr = this.indCache.atr(14) || 0;
    const adx = this.indCache.adx14 || 25;
    const rsi = this.indCache.rsi14 || 50;
    const currentPrice = this.perception.last(1)[0]?.c || 0;
    
    // Calculate Bollinger Band width proxy
    const recentPrices = this.perception.last(20).map(c => c.c);
    const sma = recentPrices.reduce((sum, price) => sum + price, 0) / recentPrices.length;
    const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / recentPrices.length;
    const stdDev = Math.sqrt(variance);
    const bbWidth = (stdDev * 2) / sma; // Normalized BB width
    
    // Calculate recent trend strength
    const fastMA = this.indCache.fastMA;
    const slowMA = this.indCache.slowMA;
    const recentTrend = fastMA && slowMA ? (fastMA - slowMA) / currentPrice : 0;
    
    // Detect current market regime
    this.currentRegime = this.regimeDetector.detectRegime({
      atr: atr / currentPrice, // Normalize ATR
      adx,
      rsi,
      bbWidth,
      recentTrend,
      currentPrice,
      symbol: this.symbol
    });

    logger.info(`🎯 MARKET REGIME UPDATE: ${this.symbol} | Regime: ${this.currentRegime.regime.toUpperCase()} (${(this.currentRegime.confidence * 100).toFixed(1)}% confidence) | Trend: ${(this.currentRegime.trendStrength * 100).toFixed(1)}%, Vol: ${(this.currentRegime.volatility * 100).toFixed(1)}%`, {
      service: 'oceanview',
      symbol: this.symbol,
      regime: this.currentRegime.regime,
      confidence: this.currentRegime.confidence,
      trendStrength: this.currentRegime.trendStrength,
      volatility: this.currentRegime.volatility,
      momentum: this.currentRegime.momentum,
      rangeStrength: this.currentRegime.rangeStrength,
      atr: atr.toFixed(6),
      adx: adx.toFixed(2),
      rsi: rsi.toFixed(2),
      bbWidth: (bbWidth * 100).toFixed(3) + '%',
      recentTrend: (recentTrend * 100).toFixed(3) + '%'
    });
  }

  private loadStrategies(): void {
    // Implementation of loadStrategies method
  }

  /**
   * Initialize asset-specific optimized configuration
   */
  private async initializeOptimizedConfig(baseConfig: Config): Promise<void> {
    try {
      const optimizedConfig = await assetOptimizer.getOptimizedConfig(this.symbol, baseConfig);
      this.cfg = optimizedConfig;
      
      logger.info(`🎯 ASSET CONFIG: Loaded optimized configuration for ${this.symbol}`, {
        symbol: this.symbol,
        hasOptimizations: optimizedConfig !== baseConfig,
        riskPct: optimizedConfig.riskPct,
        strategiesEnabled: Object.entries(optimizedConfig.strategyToggle)
          .filter(([_, enabled]) => enabled)
          .map(([name, _]) => name)
      });
    } catch (error) {
      logger.error(`Failed to load optimized config for ${this.symbol}, using base config`, {
        symbol: this.symbol,
        error: error instanceof Error ? error.message : String(error)
      });
      this.cfg = baseConfig; // Fallback to base config
    }
  }
} 