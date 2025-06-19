import { defaultConfig } from './config.js';
import { prisma } from '../../db.js';
import type { Config } from './config.js';
import type { Perception } from './perception.js';
import { IndicatorCache } from './indicators/cache.js';

// Logger interface
interface Logger {
  info: (data: any, message: string) => void;
  warn: (data: any, message: string) => void;
  error: (data: any, message: string) => void;
  debug: (data: any, message: string) => void;
}

// Use a safer global logger reference
declare global {
  var logger: Logger | undefined;
}

type Position = { 
  qty: number; 
  entry: number; 
  side: 'buy'|'sell'; 
  stop?: number; 
  stopLoss?: number;
  target?: number; // Take-profit target price
  symbol?: string; // Optional symbol reference for logging
  entryTs?: number; // Entry timestamp for tracking
};

/**
 * Determine asset class from symbol for position sizing
 * @param symbol Trading symbol
 * @returns Asset class: 'crypto', 'equity', or 'future'
 */
function getAssetClass(symbol: string): 'crypto' | 'equity' | 'future' {
  // Convert symbol to uppercase for consistent matching
  const sym = symbol.toUpperCase();
  
  // Crypto patterns (including Polygon format)
  if (sym.startsWith('X:') || sym.includes('USD') || sym.includes('BTC') || sym.includes('ETH')) {
    return 'crypto';
  }
  
  // Common equity symbols
  const equitySymbols = ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'TSLA', 'META', 'NVDA', 'AMD', 'COIN', 'SHOP', 'GME', 'SQ'];
  if (equitySymbols.includes(sym)) {
    return 'equity';
  }
  
  // Default to crypto for unknown symbols
  return 'crypto';
}

export class RiskManager {
  equity = 10_000;                // account equity USD
  openRisk = 0;                   // % of equity currently at risk
  dayPnL   = 0;                   // realised profit today
  positions: Position[] = [];
  botId?: number;                 // bot id for database updates
  config: Config;                 // configuration 
  versionId?: number;             // strategy version for logging
  private perception?: Perception; // Market perception for indicators
  private atrMultiple: number = 1.5;  // Default ATR multiple for stop calculation
  private atrPeriod: number = 14;    // Default ATR period

  constructor(botId?: number, config?: Config, perception?: Perception, atrMultiple: number = 1.5, atrPeriod: number = 14) {
    this.botId = botId;
    this.config = config || defaultConfig;
    this.perception = perception;
    this.atrMultiple = atrMultiple;
    this.atrPeriod = atrPeriod;
    this.loadEquity();
  }

  async loadEquity() {
    if (!this.botId) return;
    
    try {
      // @ts-ignore - Working with new schema field
      const bot = await prisma.bot.findUnique({ where: { id: this.botId } });
      if (bot?.equity) {
        this.equity = bot.equity;
      }
    } catch (err) {
      console.error('Failed to load equity:', err);
    }
  }

  /**
   * Enhanced position sizing with multiple risk factors
   * @param stop Stop loss price
   * @param entry Entry price
   * @param symbol Trading symbol for performance-based adjustments
   * @param confidence Signal confidence (0-1, default 1)
   * @returns Position size
   */
  sizeTrade(stop: number, entry: number, symbol?: string, confidence: number = 1.0): number {
    // Base risk calculation
    const baseRiskPct = this.config.riskPct / 100; // Convert to decimal
    const riskDistance = Math.abs(entry - stop);
    
    // ========================================
    // 🎯 ENHANCED POSITION SIZING FACTORS
    // ========================================
    
    // 1. Asset-class specific risk multiplier
    let assetClassMultiplier = 1.0;
    if (symbol && this.config.assetClassRisk) {
      const assetClass = getAssetClass(symbol);
      assetClassMultiplier = this.config.assetClassRisk[assetClass] || 1.0;
    }
    
    // 2. Volatility-based adjustment
    const indicators = this.perception as unknown as { indicators?: IndicatorCache };
    const atr = indicators?.indicators?.atr?.(14) ?? entry * 0.005;
    const atrPct = atr / entry;
    const targetVol = 0.008; // Target 0.8% volatility
    const volFactor = Math.min(1.5, Math.max(0.6, targetVol / atrPct));
    
    // 3. Confidence-based adjustment (reduce size for low-confidence signals)
    const confidenceFactor = Math.max(0.5, confidence);
    
    // 4. Portfolio heat adjustment (reduce size if already exposed)
    const portfolioHeatFactor = this.openRisk > 15 ? 0.7 : 1.0;
    
    // 5. Equity curve adjustment (reduce size after losses)
    const equityCurveFactor = this.dayPnL < -this.equity * 0.02 ? 0.8 : 1.0; // Reduce after 2% daily loss
    
    // 6. Risk distance adjustment (smaller size for wider stops)
    const riskDistancePct = riskDistance / entry;
    const riskDistanceFactor = riskDistancePct > 0.02 ? 0.8 : 1.0; // Reduce for stops >2%
    
    // Calculate final risk amount
    const adjustedRiskPct = baseRiskPct * assetClassMultiplier * volFactor * confidenceFactor * portfolioHeatFactor * equityCurveFactor * riskDistanceFactor;
    const riskDollar = adjustedRiskPct * this.equity;
    const qty = riskDollar / riskDistance;
    
    // Log the sizing calculation
    if (typeof global.logger !== 'undefined') {
      global.logger.info({
        symbol: symbol || 'unknown',
        assetClass: symbol ? getAssetClass(symbol) : 'unknown',
        baseRiskPct: (baseRiskPct * 100).toFixed(2) + '%',
        assetClassMultiplier: assetClassMultiplier.toFixed(2),
        adjustedRiskPct: (adjustedRiskPct * 100).toFixed(2) + '%',
        volFactor: volFactor.toFixed(2),
        confidenceFactor: confidenceFactor.toFixed(2),
        portfolioHeatFactor: portfolioHeatFactor.toFixed(2),
        equityCurveFactor: equityCurveFactor.toFixed(2),
        riskDistanceFactor: riskDistanceFactor.toFixed(2),
        riskDollar: riskDollar.toFixed(2),
        qty: qty.toFixed(6),
        entry: entry.toFixed(2),
        stop: stop.toFixed(2),
        riskDistance: riskDistance.toFixed(4),
        atrPct: (atrPct * 100).toFixed(3) + '%',
        openRisk: this.openRisk.toFixed(1) + '%',
        dayPnL: this.dayPnL.toFixed(2)
      }, "Enhanced position sizing calculation with asset-class multipliers");
    }
    
    return Math.max(0.01, +qty.toFixed(6)); // Minimum position size
  }

  updateStops(position: Position): number | null {
    if (!this.perception) return null;
    
    // Get the indicators from perception
    const indicators = this.perception as unknown as { indicators: IndicatorCache };
    const atr = indicators?.indicators?.atr?.(this.atrPeriod) || 0;
    if (atr === 0) return null; // safety check if insufficient data
    
    const lastCandles = this.perception.last(1);
    if (!lastCandles || lastCandles.length === 0) return null;
    
    const lastCandle = lastCandles[0];
    const currentPrice = lastCandle.c;
    
    // ========================================
    // 🎯 PROFIT THRESHOLD BEFORE TRAILING STOP ACTIVATION
    // ========================================
    
    // Get profit threshold from config or environment (default 1%)
    const baseThreshold = parseFloat(process.env.TRAILING_STOP_THRESHOLD || '0.01');
    
    // Calculate current unrealized profit/loss
    const unrealizedPnL = position.side === 'buy' 
      ? ((currentPrice - position.entry) / position.entry)  // Long: profit when price increases
      : ((position.entry - currentPrice) / position.entry); // Short: profit when price decreases
    
    // Get asset class for threshold adjustments
    const assetClass = position.symbol ? getAssetClass(position.symbol) : 'crypto';
    
    // Use config-based thresholds if available, otherwise fall back to calculated defaults
    const configThresholds = this.config.trailingStopThresholds;
    const adjustedThreshold = configThresholds?.[assetClass] ?? 
      (assetClass === 'crypto' ? baseThreshold : 
       assetClass === 'equity' ? baseThreshold * 0.5 : 
       baseThreshold * 0.75);
    const adjustedThresholdMet = unrealizedPnL >= adjustedThreshold;
    
    // Only activate trailing stops after profit threshold is met
    if (!adjustedThresholdMet) {
      // Log why trailing stop is not activated
      if (typeof global.logger !== 'undefined') {
        global.logger.debug({
          symbol: position.symbol || 'unknown',
          assetClass,
          currentPrice: currentPrice.toFixed(4),
          entryPrice: position.entry.toFixed(4),
          unrealizedPnL: (unrealizedPnL * 100).toFixed(2) + '%',
          requiredThreshold: (adjustedThreshold * 100).toFixed(2) + '%',
          thresholdMet: adjustedThresholdMet,
          side: position.side
        }, "Trailing stop NOT activated - profit threshold not met");
      }
      
      return null; // Don't adjust stops until profit threshold is met
    }
    
    // ========================================
    // 🎯 CALCULATE NEW TRAILING STOP
    // ========================================
    
    let newStop: number | null = null;
    
    if (position.side === 'buy') {
      // For long positions, trail below the price
      const trailingStop = currentPrice - (atr * this.atrMultiple);
      // Only move stop up (more favorable), never down
      newStop = Math.max(position.stop ?? -Infinity, trailingStop);
    } else if (position.side === 'sell') {
      // For short positions, trail above the price
      const trailingStop = currentPrice + (atr * this.atrMultiple);
      // Only move stop down (more favorable), never up
      newStop = Math.min(position.stop ?? Infinity, trailingStop);
    }
    
    // Only update if the new stop is more favorable
    const stopImproved = newStop !== null && newStop !== position.stop;
    
    // Enhanced logging with profit threshold details
    if (stopImproved) {
      const symbol = position.symbol || 'unknown';
      const profitLocked = position.side === 'buy' 
        ? ((newStop! - position.entry) / position.entry * 100)
        : ((position.entry - newStop!) / position.entry * 100);
      
      console.log(`✅ TRAILING STOP ACTIVATED: ${symbol} | Profit: ${(unrealizedPnL * 100).toFixed(2)}% (threshold: ${(adjustedThreshold * 100).toFixed(2)}%) | Stop: ${position.stop?.toFixed(4)} → ${newStop!.toFixed(4)} | Locked profit: ${profitLocked.toFixed(2)}%`);
      
      // Use enhanced logger if available
      if (typeof global.logger !== 'undefined') {
        global.logger.info({ 
          symbol,
          assetClass,
          side: position.side,
          currentPrice: currentPrice.toFixed(4),
          entryPrice: position.entry.toFixed(4),
          oldStop: position.stop?.toFixed(4),
          newStop: newStop!.toFixed(4),
          unrealizedPnL: (unrealizedPnL * 100).toFixed(2) + '%',
          profitThreshold: (adjustedThreshold * 100).toFixed(2) + '%',
          lockedProfit: profitLocked.toFixed(2) + '%',
          atr: atr.toFixed(4),
          atrMultiple: this.atrMultiple,
          thresholdMet: adjustedThresholdMet
        }, "🎯 TRAILING STOP ACTIVATED - Profit threshold met, trailing stop engaged");
      }
    } else if (adjustedThresholdMet && newStop === position.stop) {
      // Log when threshold is met but stop doesn't need adjustment
      if (typeof global.logger !== 'undefined') {
        global.logger.debug({
          symbol: position.symbol || 'unknown',
          unrealizedPnL: (unrealizedPnL * 100).toFixed(2) + '%',
          reason: 'stop_already_optimal'
        }, "Trailing stop threshold met but no adjustment needed");
      }
    }
    
    return newStop;
  }

  canTrade(){
    // DEPRECATED: Use PortfolioRiskManager.canTrade() instead
    // This method will be removed in a future release
    return true;  // Always return true, portfolio risk manager will handle risk checks
  }

  registerOrder(side:'buy'|'sell', qty:number, price:number, stop?: number, target?: number, symbol?: string) {
    const effectiveStop = stop || price * 0.01;  // 1% default if not provided
    const riskPct = (qty * Math.abs(price - effectiveStop)) / this.equity * 100;
    this.openRisk += riskPct;
    this.positions.push({ 
      qty, 
      entry: price, 
      side, 
      stop: effectiveStop,
      stopLoss: effectiveStop, // Initialize stopLoss with the same value as stop
      target, // Store take-profit target
      symbol, // Store symbol for logging
      entryTs: Date.now() // Store entry timestamp
    });
    
    // Apply trailing stop immediately if perception is available
    if (this.positions.length > 0 && this.perception) {
      const latestPosition = this.positions[this.positions.length - 1];
      const newStop = this.updateStops(latestPosition);
      if (newStop !== null) {
        latestPosition.stop = newStop;
      }
    }
  }

  // simplistic close handling (fills always at price)
  async closePosition(qty:number, price:number, fee:number = 0){
    const pos = this.positions.shift();
    if(!pos) return 0; // Return 0 if no position found
    let pnl = pos.side==='buy'
      ? (price-pos.entry)*qty
      : (pos.entry-price)*qty;
    
    const totalFee = fee || price * qty * 0.0004;
    pnl -= totalFee;             // subtract commission
    
    this.dayPnL += pnl;
    this.equity += pnl;
    const stop = pos.entry*0.01;
    this.openRisk -= (qty*stop)/this.equity*100;
    
    // Update equity in database
    if (this.botId) {
      try {
        // @ts-ignore - Working with new schema field
        await prisma.bot.update({ 
          where: { id: this.botId },
          data: { 
            equity: this.equity,
            pnlToday: this.dayPnL
          }
        });
        
        // Persist equity to accountState
        await prisma.accountState.upsert({ 
          where: { id: 1 }, 
          update: { equity: this.equity },
          create: { id: 1, equity: this.equity }
        });
      } catch (err) {
        console.error('Failed to update equity:', err);
      }
    }

    // Return the individual trade PnL
    return pnl;
  }

  /**
   * Check if any positions should be closed based on stop-loss or take-profit levels
   * @param currentPrice Current market price
   * @returns Object with exit signals and reasons
   */
  checkExitConditions(currentPrice: number): {
    shouldExit: boolean;
    reason: 'stop_loss' | 'take_profit' | 'min_hold_violated' | null;
    position?: Position;
  } {
    if (this.positions.length === 0) {
      return { shouldExit: false, reason: null };
    }

    const position = this.positions[0]; // Check first position (FIFO)
    const currentTime = Date.now();
    const positionAge = position.entryTs ? currentTime - position.entryTs : 0;
    
    // Get minimum hold time for this asset class
    const assetClass = position.symbol ? getAssetClass(position.symbol) : 'crypto';
    const minHoldTime = this.config.minHoldTimes?.[assetClass] || 0;
    
    // Always allow stop-loss exits regardless of hold time (risk protection)
    if (position.stop) {
      const stopHit = (position.side === 'buy' && currentPrice <= position.stop) ||
                      (position.side === 'sell' && currentPrice >= position.stop);
      
      if (stopHit) {
        // Log stop-loss with hold time info
        if (typeof global.logger !== 'undefined') {
          global.logger.info({
            symbol: position.symbol || 'unknown',
            assetClass,
            positionAge,
            minHoldTime,
            earlyExit: positionAge < minHoldTime,
            exitReason: 'stop_loss'
          }, "Stop-loss exit (bypasses min hold time)");
        }
        
        return { 
          shouldExit: true, 
          reason: 'stop_loss', 
          position 
        };
      }
    }
    
    // Check minimum hold time before allowing take-profit exits
    if (positionAge < minHoldTime) {
      // Log hold time violation
      if (typeof global.logger !== 'undefined') {
        global.logger.debug({
          symbol: position.symbol || 'unknown',
          assetClass,
          positionAge,
          minHoldTime,
          remainingTime: minHoldTime - positionAge
        }, "Exit blocked by minimum hold time");
      }
      
      return { 
        shouldExit: false, 
        reason: 'min_hold_violated',
        position 
      };
    }
    
    // Check take-profit conditions (only after minimum hold time)
    if (position.target) {
      const targetHit = (position.side === 'buy' && currentPrice >= position.target) ||
                        (position.side === 'sell' && currentPrice <= position.target);
      
      if (targetHit) {
        // Log successful take-profit after min hold
        if (typeof global.logger !== 'undefined') {
          global.logger.info({
            symbol: position.symbol || 'unknown',
            assetClass,
            positionAge,
            minHoldTime,
            exitReason: 'take_profit'
          }, "Take-profit exit after minimum hold time");
        }
        
        return { 
          shouldExit: true, 
          reason: 'take_profit', 
          position 
        };
      }
    }
    
    return { shouldExit: false, reason: null };
  }

  /**
   * Update stops for all open positions based on current market conditions
   * @returns Array of updated stop values or null if no update was made
   */
  updateAllStops(): (number | null)[] {
    if (!this.perception || this.positions.length === 0) return [];
    
    // Use the enhanced updateStops method for each position
    const updatedStops: (number | null)[] = [];
    
    this.positions.forEach(position => {
      const newStop = this.updateStops(position);
      
      // Update position with new stop if returned
      if (newStop !== null && newStop !== position.stop) {
        position.stop = newStop;
      }
      
      updatedStops.push(position.stop || null);
    });
    
    return updatedStops;
  }
} 