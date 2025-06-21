import { PolygonDataFeed } from '../feeds/polygonDataFeed.js';
import { createLogger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { MarketRegimeDetector, MarketRegimeAnalysis } from '../bots/hypertrades/marketRegimeDetector.js';
import { SmartExitManager, type SmartExitConfig } from '../bots/hypertrades/strategies/smartExits.js';
import { VolumeConfirmationManager, type VolumeProfile } from '../bots/hypertrades/strategies/volumeConfirmation.js';
import { CorrelationManager, type PositionCorrelationAnalysis } from '../bots/hypertrades/strategies/correlationManager.js';
import { MultiTimeframeAnalyzer, type MultiTimeframeSignal } from '../bots/hypertrades/strategies/multiTimeframeAnalysis.js';

const logger = createLogger('isolated-backtest');

interface BacktestConfig {
  riskPct: number;
  maxDailyLoss: number;
  maxOpenRisk: number;
  smcThresh: number;
  rsiOS: number;
  rsiOB: number;
  atrMultiple: number;
  atrPeriod: number;
  gatekeeperThresh: number;
  fastMAPeriod: number;
  slowMAPeriod: number;
  strategyToggle: {
    TrendFollowMA: boolean;
    RangeBounce: boolean;
    SMCReversal: boolean;
    MomentumScalp: boolean;
  };
  timeBasedExitHours: number;
}

interface BacktestState {
  equity: number;
  cash: number;
  dayPnL: number;
  totalPnL: number;
  openPositions: Map<string, any>;
  trades: any[];
  riskBreaches: number;
  totalRiskChecks: number;
  currentRegime?: MarketRegimeAnalysis;
}

interface BacktestResults {
  symbol: string;
  trades: number;
  pnl: number;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
  totalReturn: number;
  riskBreachRate: number;
  avgTradeSize: number;
  avgHoldTime: number;
  regimeStats?: {
    trendingTrades: number;
    rangingTrades: number;
    volatileTrades: number;
    quietTrades: number;
  };
}

class IsolatedBacktestEngine {
  private config: BacktestConfig;
  private state: BacktestState;
  private startingEquity: number = 10000;   // ← standardise test equity
  private regimeDetector: MarketRegimeDetector;
  private volumeManager: VolumeConfirmationManager;
  private correlationManager: CorrelationManager;
  private mtfAnalyzer: MultiTimeframeAnalyzer;

  constructor(config: BacktestConfig) {
    this.config = config;
    this.regimeDetector = new MarketRegimeDetector();
    this.volumeManager = new VolumeConfirmationManager();
    this.correlationManager = new CorrelationManager();
    this.mtfAnalyzer = new MultiTimeframeAnalyzer();
    this.state = {
      equity: this.startingEquity,
      cash: this.startingEquity,
      dayPnL: 0,
      totalPnL: 0,
      openPositions: new Map(),
      trades: [],
      riskBreaches: 0,
      totalRiskChecks: 0
    };
  }

  // Isolated risk check that doesn't touch production database
  private checkRisk(positionValue: number): boolean {
    this.state.totalRiskChecks++;
    
    // Day loss check - only count actual losses
    const dayLossPercent = this.state.dayPnL < 0 ? Math.abs(this.state.dayPnL) / this.startingEquity : 0;
    
    // Open risk check - sum all position risks, not position values
    let totalOpenRisk = 0;
    for (const position of this.state.openPositions.values()) {
      // Assume 2% risk per position (stop loss distance)
      if (position.quantity && position.entryPrice && isFinite(position.quantity) && isFinite(position.entryPrice)) {
        totalOpenRisk += (position.quantity * position.entryPrice) * 0.02;
      }
    }
    // Add risk for new position (2% of position value)
    totalOpenRisk += positionValue * 0.02;
    const openRiskPercent = totalOpenRisk / this.state.equity;
    
    const dayLossExceeded = dayLossPercent > this.config.maxDailyLoss;
    const openRiskExceeded = openRiskPercent > this.config.maxOpenRisk;
    
    if (dayLossExceeded || openRiskExceeded) {
      this.state.riskBreaches++;
      logger.debug(`❌ Risk breach: dayLoss=${(dayLossPercent*100).toFixed(2)}% (limit ${(this.config.maxDailyLoss*100).toFixed(0)}%), openRisk=${(openRiskPercent*100).toFixed(2)}% (limit ${(this.config.maxOpenRisk*100).toFixed(0)}%), positionValue=$${positionValue.toFixed(2)}, totalOpenRisk=$${totalOpenRisk.toFixed(2)}, equity=$${this.state.equity.toFixed(2)}`);
      return false;
    }
    
    // Only log first few successful checks to avoid spam
    if (this.state.totalRiskChecks <= 3) {
      logger.debug(`✅ Risk check passed: dayLoss=${(dayLossPercent*100).toFixed(2)}%, openRisk=${(openRiskPercent*100).toFixed(2)}%, positionValue=$${positionValue.toFixed(2)}`);
    }
    return true;
  }

  // Simple technical analysis for isolated backtesting
  private calculateIndicators(candles: any[]): any {
    if (candles.length < 50) return null;
    
    const closes = candles.map(c => c.c);
    const highs = candles.map(c => c.h);
    const lows = candles.map(c => c.l);
    
    // Simple Moving Averages
    const sma50 = closes.slice(-50).reduce((a, b) => a + b) / 50;
    const sma200 = closes.length >= 200 ? 
      closes.slice(-200).reduce((a, b) => a + b) / 200 : sma50;
    
    // RSI calculation (simplified)
    const rsiPeriod = 14;
    if (closes.length < rsiPeriod + 1) return null;
    
    let gains = 0, losses = 0;
    for (let i = closes.length - rsiPeriod; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }
    
    const avgGain = gains / rsiPeriod;
    const avgLoss = losses / rsiPeriod;
    const rs = avgGain / (avgLoss || 0.0001);
    const rsi = 100 - (100 / (1 + rs));
    
    // ATR calculation (simplified)
    let atrSum = 0;
    const atrPeriod = this.config.atrPeriod;
    for (let i = Math.max(1, closes.length - atrPeriod); i < closes.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      atrSum += tr;
    }
    const atr = atrSum / Math.min(atrPeriod, closes.length - 1);
    
    return {
      sma50,
      sma200,
      rsi,
      atr,
      price: closes[closes.length - 1],
      trend: sma50 > sma200 ? 'bullish' : 'bearish'
    };
  }

  // REGIME-AWARE signal generation with enhanced bear market short selling
  // 🚨 ENHANCED EXIT CONDITIONS - Check before generating new signals
  private checkExitConditions(candle: any, indicators: any, regime: any): { action: 'buy' | 'sell' | 'hold'; strategy: string; confidence: number } | null {
    // Only check exits if we have open positions
    if (this.state.openPositions.size === 0) return null;
    
    const { rsi } = indicators;
    const currentPrice = candle.c;
    
    for (const [positionKey, position] of this.state.openPositions) {
      // ── WATERMARK UPDATE ───────────────────────────────
      if (position.side === 'buy')  position.highestPrice = Math.max(position.highestPrice, candle.c);
      if (position.side === 'sell') position.lowestPrice  = Math.min(position.lowestPrice,  candle.c);
      
      const unrealizedPnL = position.side === 'buy' 
        ? (currentPrice - position.entryPrice) * position.quantity
        : (position.entryPrice - currentPrice) * position.quantity;
      
      const unrealizedPnLPct = unrealizedPnL / Math.abs(position.entryPrice * position.quantity);
      
      // 🛡️ REGIME-AWARE STOP LOSS
      let stopLossThreshold = -0.025; // Base 2.5% stop loss
      if (regime.regime === 'volatile') {
        stopLossThreshold = -0.04; // Wider stops in volatile markets (4%)
      } else if (regime.regime === 'quiet') {
        stopLossThreshold = -0.015; // Tighter stops in quiet markets (1.5%)
      }
      
      if (unrealizedPnLPct <= stopLossThreshold) {
        const exitAction = position.side === 'buy' ? 'sell' : 'buy';
        return { action: exitAction, strategy: 'regime_stop_loss', confidence: 0.95 };
      }
      
      // 📈 DYNAMIC TAKE PROFIT with Trailing Stop
      let takeProfitThreshold = 0.03; // Base 3% take profit
      if (regime.regime === 'trending' && regime.confidence > 0.7) {
        takeProfitThreshold = 0.055; // Let winners run in strong trends (5.5%)
      } else if (regime.regime === 'ranging') {
        takeProfitThreshold = 0.025; // Take profits quicker in ranging markets (2.5%)
      }
      
      // 📈 TRUE TRAILING-PROFIT (hi-water-mark + ATR)
      const atr = indicators.atr ?? (currentPrice * 0.008);        // fallback
      const trailMult   = regime.regime === 'trending' ? 1.2 : 1.8; // tighter in trends
      const trailBuffer = atr * trailMult;
      const trailStop   = position.side === 'buy'
          ? position.highestPrice - trailBuffer
          : position.lowestPrice  + trailBuffer;

      const hitTrail = position.side === 'buy'
          ? candle.c <= trailStop
          : candle.c >= trailStop;

      if (hitTrail && unrealizedPnLPct > 0.004) {   // at least 0.4% locked
        const exitAction = position.side === 'buy' ? 'sell' : 'buy';
        return { action: exitAction, strategy: 'trailing_profit', confidence: 0.95 };
      }
      
      // Standard take profit
      if (unrealizedPnLPct >= takeProfitThreshold) {
        const exitAction = position.side === 'buy' ? 'sell' : 'buy';
        return { action: exitAction, strategy: 'take_profit', confidence: 0.8 };
      }
      
      // 🎭 REGIME-AWARE RSI EXITS
      const rsiExitThreshold = regime.regime === 'ranging' ? 8 : 12; // Tighter in ranging markets
      
      if (position.side === 'buy' && rsi > (78 - rsiExitThreshold)) {
        const rsiExitConfidence = ((rsi - 70) / 30) * regime.confidence;
        if (rsiExitConfidence > 0.5) {
          return { action: 'sell', strategy: 'rsi_overbought_exit', confidence: rsiExitConfidence };
        }
      }
      
      if (position.side === 'sell' && rsi < (22 + rsiExitThreshold)) {
        const rsiExitConfidence = ((30 - rsi) / 30) * regime.confidence;
        if (rsiExitConfidence > 0.5) {
          return { action: 'buy', strategy: 'rsi_oversold_exit', confidence: rsiExitConfidence };
        }
      }
      
      // 🚨 REGIME CHANGE EXIT - Exit if regime confidence drops significantly
      if (regime.confidence < 0.25 && unrealizedPnLPct < 0.01) {
        const exitAction = position.side === 'buy' ? 'sell' : 'buy';
        return { action: exitAction, strategy: 'regime_uncertainty_exit', confidence: 0.6 };
      }
      
      // ⏰ TIME-BASED EXIT – close positions that have been open too long (extended to 48h)
      const maxHoldMs = (this.config.timeBasedExitHours ?? 48) * 60 * 60 * 1000; // Extended from 24h to 48h
      if (candle.ts - position.entryTime >= maxHoldMs) {
        const exitAction = position.side === 'buy' ? 'sell' : 'buy';
        return { action: exitAction, strategy: 'time_exit', confidence: 0.7 };
      }
      
      // 🚫 HARD STOP-LOSS – cut losers faster
      const hardStopPct = 0.004; // 0.4% hard stop (tighter)
      const hardStopLoss = position.side === 'buy' 
        ? position.entryPrice * (1 - hardStopPct)  // Long: stop below entry
        : position.entryPrice * (1 + hardStopPct); // Short: stop above entry
      
      const hitHardStop = position.side === 'buy' 
        ? candle.c <= hardStopLoss
        : candle.c >= hardStopLoss;
        
      if (hitHardStop) {
        const exitAction = position.side === 'buy' ? 'sell' : 'buy';
        return { action: exitAction, strategy: 'hard_stop_loss', confidence: 0.9 };
      }

      // 🛡 BREAK-EVEN PROTECTOR
      if (unrealizedPnLPct > 0.008) {
         const breakeven = position.entryPrice;            // move stop to entry
         const breach = position.side === 'buy'
             ? candle.c <= breakeven
             : candle.c >= breakeven;
         if (breach) {
           const exitAction = position.side === 'buy' ? 'sell' : 'buy';
           return { action: exitAction, strategy: 'break_even_exit', confidence: 0.85 };
         }
      }

      // 🎯 ASYMMETRIC TAKE-PROFIT – 3.75:1 risk-reward ratio
      const takeProfitPct = 0.015; // 1.5% take profit (3.75x the 0.4% stop loss)
      const takeProfitLevel = position.side === 'buy' 
        ? position.entryPrice * (1 + takeProfitPct)  // Long: profit above entry
        : position.entryPrice * (1 - takeProfitPct); // Short: profit below entry
      
      const hitTakeProfit = position.side === 'buy' 
        ? candle.c >= takeProfitLevel
        : candle.c <= takeProfitLevel;
        
      if (hitTakeProfit) {
        const exitAction = position.side === 'buy' ? 'sell' : 'buy';
        return { action: exitAction, strategy: 'take_profit', confidence: 0.9 };
      }
    }
    
    return null;
  }

  private generateSignal(indicators: any, candles: any[]): { action: 'buy' | 'sell' | 'hold'; strategy: string; confidence: number } {
    if (!indicators || candles.length < 10) {
      return { action: 'hold', strategy: 'insufficient_data', confidence: 0 };
    }
    
    const { rsi, sma50, sma200, price, atr } = indicators;
    const recentCandles = candles.slice(-20);
    const recentPrices = recentCandles.map(c => c.c);
    const recentHigh = Math.max(...recentCandles.map(c => c.h));
    const recentLow = Math.min(...recentCandles.map(c => c.l));
    const priceRange = recentHigh - recentLow;
    
    // Calculate momentum and volatility
    const momentum = candles.length >= 5 ? 
      (price - candles[candles.length - 5].c) / candles[candles.length - 5].c * 100 : 0;
    const volatility = priceRange / price * 100;
    
    // 🎯 DETECT MARKET REGIME FIRST
    const regimeInput = {
      atr: atr / price, // Normalize ATR as percentage
      adx: Math.abs(momentum) * 10, // Use momentum as ADX proxy
      rsi,
      bbWidth: priceRange / price, // Use price range as BB width proxy
      recentTrend: (sma50 - sma200) / sma200,
      currentPrice: price,
      symbol: 'BACKTEST'
    };
    
    this.state.currentRegime = this.regimeDetector.detectRegime(regimeInput);
    const regime = this.state.currentRegime;
    
    // 🚨 CHECK EXIT CONDITIONS FIRST - Priority over new entries
    const exitSignal = this.checkExitConditions(candles[candles.length - 1], indicators, regime);
    if (exitSignal) {
      return exitSignal;
    }
    
    // 📊 ANALYZE VOLUME CONFIRMATION
    const volumeProfile = this.volumeManager.analyzeVolume(candles);
    
    // 🔄 MULTI-TIMEFRAME ANALYSIS
    const mtfAnalysis = this.mtfAnalyzer.analyzeMultiTimeframe(candles);
    
    logger.debug(`📊 Market Regime: ${regime.regime.toUpperCase()} (${(regime.confidence * 100).toFixed(1)}% confidence) | Trend: ${regime.trendStrength.toFixed(2)} | Vol: ${regime.volatility.toFixed(2)}`);
    logger.debug(`🔊 Volume: ${volumeProfile.confirmation} (${volumeProfile.recentVolumeRatio.toFixed(2)}x avg, ${volumeProfile.volumeTrend})`);
    logger.debug(`🔄 MTF: ${mtfAnalysis.alignment} ${mtfAnalysis.primaryTrend} (${(mtfAnalysis.confidence * 100).toFixed(1)}% conf) - ${mtfAnalysis.reason}`);
    
    // 🚀 REGIME-AWARE STRATEGY SELECTION
    
          // 🎯 QUALITY FILTER: Only proceed with high-confidence signals (FINAL OPTIMIZATION)
      let MIN_CONFIDENCE_THRESHOLD: number;
      
      if (regime?.regime === 'trending' || regime?.regime === 'volatile') {
        MIN_CONFIDENCE_THRESHOLD = 0.25; // Permissive in active markets
      } else if (regime?.regime === 'ranging') {
        MIN_CONFIDENCE_THRESHOLD = 0.35; // Moderate in ranging markets
      } else {
        MIN_CONFIDENCE_THRESHOLD = 0.45; // Strict in quiet markets
      }
    
    // Strategy 1: RSI Mean Reversion - Best in RANGING/QUIET markets (STABILITY-AWARE)
    if ((regime.regime === 'ranging' || regime.regime === 'quiet') && regime.confidence > 0.25) {
      // 🎯 STABILITY BONUS: Higher confidence for stable regimes
      const stabilityBonus = regime.regimeStability > 0.8 ? 0.15 : (regime.regimeStability > 0.6 ? 0.1 : 0);
      
      if (rsi < this.config.rsiOS && momentum < -0.3) {
        // 🔊 VOLUME FILTER: Check if signal should be filtered
        if (this.volumeManager.shouldFilterSignal(volumeProfile, 'buy')) {
          logger.debug(`🚫 Volume filter: RSI oversold signal filtered (${volumeProfile.confirmation})`);
          return { action: 'hold', strategy: 'volume_filtered', confidence: 0 };
        }
        
        // 🔄 MULTI-TIMEFRAME FILTER: Check if MTF confirms signal
        if (!this.mtfAnalyzer.shouldConfirmSignal('buy', mtfAnalysis)) {
          logger.debug(`🚫 MTF filter: RSI oversold signal filtered (${mtfAnalysis.alignment} ${mtfAnalysis.primaryTrend})`);
          return { action: 'hold', strategy: 'mtf_filtered', confidence: 0 };
        }
        
        const rsiStrength = (this.config.rsiOS - rsi) / this.config.rsiOS;
        const momentumBonus = Math.abs(momentum) / 15;
        const mtfBonus = mtfAnalysis.confidence * 0.15; // MTF confirmation bonus
        let confidence = Math.min(0.95, 0.45 + rsiStrength * 0.25 + momentumBonus * 0.1 + stabilityBonus + mtfBonus) * regime.confidence;
        
        // 🔊 VOLUME BOOST: Adjust confidence based on volume
        confidence = this.volumeManager.adjustSignalConfidence(confidence, volumeProfile);
        
        return { action: 'buy', strategy: `RSI_Oversold_${regime.regime}_MTF`, confidence };
      }
      if (rsi > this.config.rsiOB && momentum > 0.3) {
        // 🔊 VOLUME FILTER: Check if signal should be filtered
        if (this.volumeManager.shouldFilterSignal(volumeProfile, 'sell')) {
          logger.debug(`🚫 Volume filter: RSI overbought signal filtered (${volumeProfile.confirmation})`);
          return { action: 'hold', strategy: 'volume_filtered', confidence: 0 };
        }
        
        // 🔄 MULTI-TIMEFRAME FILTER: Check if MTF confirms signal
        if (!this.mtfAnalyzer.shouldConfirmSignal('sell', mtfAnalysis)) {
          logger.debug(`🚫 MTF filter: RSI overbought signal filtered (${mtfAnalysis.alignment} ${mtfAnalysis.primaryTrend})`);
          return { action: 'hold', strategy: 'mtf_filtered', confidence: 0 };
        }
        
        const rsiStrength = (rsi - this.config.rsiOB) / (100 - this.config.rsiOB);
        const momentumBonus = Math.abs(momentum) / 15;
        const mtfBonus = mtfAnalysis.confidence * 0.15; // MTF confirmation bonus
        let confidence = Math.min(0.95, 0.45 + rsiStrength * 0.25 + momentumBonus * 0.1 + stabilityBonus + mtfBonus) * regime.confidence;
        
        // 🔊 VOLUME BOOST: Adjust confidence based on volume
        confidence = this.volumeManager.adjustSignalConfidence(confidence, volumeProfile);
        
        return { action: 'sell', strategy: `RSI_Overbought_${regime.regime}_MTF`, confidence };
      }
             // Additional quiet market signals with VERY TIGHT criteria (NOISE REDUCTION)
       if (rsi < 25 && momentum < -0.4 && regime.regimeStability > 0.7) { // Much tighter: RSI < 25, momentum < -0.4
         // Require BOTH volume confirmation AND MTF alignment
         if (volumeProfile.confirmation !== 'none' && mtfAnalysis.alignment !== 'conflicting' && mtfAnalysis.confidence > 0.15) {
           const confidence = Math.min(0.65, 0.25 + (25 - rsi) / 50 + stabilityBonus) * regime.confidence;
           return { action: 'buy', strategy: `QuietMarket_Dip_${regime.regime}`, confidence };
         }
       }
       if (rsi > 75 && momentum > 0.4 && regime.regimeStability > 0.7) { // Much tighter: RSI > 75, momentum > 0.4
         // Require BOTH volume confirmation AND MTF alignment
         if (volumeProfile.confirmation !== 'none' && mtfAnalysis.alignment !== 'conflicting' && mtfAnalysis.confidence > 0.15) {
           const confidence = Math.min(0.65, 0.25 + (rsi - 75) / 50 + stabilityBonus) * regime.confidence;
           return { action: 'sell', strategy: `QuietMarket_Rally_${regime.regime}`, confidence };
         }
       }
    }
    
    // Strategy 2: TREND FOLLOWING - Best in TRENDING markets (BULL or BEAR) + ACTIVE IN ALL REGIMES
    if (this.config.strategyToggle.TrendFollowMA && regime.confidence > 0.25) {
      const trendStrength = Math.abs(sma50 - sma200) / price * 100;
      const priceAboveFastMA = (price - sma50) / sma50 * 100;
      
      // 🐂 BULL MARKET: Bullish trend (relaxed criteria)
      if (price > sma50 && sma50 > sma200 && rsi > 45 && rsi < 75 && momentum > 0.8) {
        const confidence = Math.min(0.9, 0.5 + regime.trendStrength + Math.abs(priceAboveFastMA) / 30) * regime.confidence;
        return { action: 'buy', strategy: `TrendFollowMA_Bull`, confidence };
      }
      
      // 🐻 BEAR MARKET: Bearish trend - PROFIT FROM SHORTS!
      if (price < sma50 && sma50 < sma200 && rsi < 55 && rsi > 25 && momentum < -0.8) {
        const confidence = Math.min(0.9, 0.5 + regime.trendStrength + Math.abs(priceAboveFastMA) / 30) * regime.confidence;
        return { action: 'sell', strategy: `TrendFollowMA_Bear`, confidence };
      }
      
      // Additional trend signals for sideways-trending periods
      if (regime.regime !== 'trending') {
        // Weak bullish momentum in non-trending market
        if (price > sma50 && momentum > 0.3 && rsi > 50 && rsi < 65) {
          const confidence = Math.min(0.75, 0.4 + momentum / 10) * regime.confidence;
          return { action: 'buy', strategy: `WeakTrend_Bull_${regime.regime}`, confidence };
        }
        // Weak bearish momentum in non-trending market  
        if (price < sma50 && momentum < -0.3 && rsi < 50 && rsi > 35) {
          const confidence = Math.min(0.75, 0.4 + Math.abs(momentum) / 10) * regime.confidence;
          return { action: 'sell', strategy: `WeakTrend_Bear_${regime.regime}`, confidence };
        }
      }
    }
    
    // Strategy 3: Enhanced Range Bounce - REGIME-AWARE
    if (this.config.strategyToggle.RangeBounce && regime.regime === 'ranging' && regime.confidence > 0.35) {
      const pricePosition = (price - recentLow) / (recentHigh - recentLow); // 0-1 position in range
      const stabilityBonus = regime.regimeStability > 0.6 ? 0.1 : 0;
      
      // Buy near support (bottom 30% of range)
      if (pricePosition < 0.3 && rsi < 50 && momentum < 0.5) {
        const supportStrength = (0.3 - pricePosition) * 3.33; // 0-1 scale
        const confidence = Math.min(0.8, 0.45 + supportStrength * 0.2 + stabilityBonus) * regime.confidence;
        return { action: 'buy', strategy: `RangeBounce_Support_${regime.regime}`, confidence };
      }
      
      // Sell near resistance (top 30% of range)
      if (pricePosition > 0.7 && rsi > 50 && momentum > -0.5) {
        const resistanceStrength = (pricePosition - 0.7) * 3.33; // 0-1 scale
        const confidence = Math.min(0.8, 0.45 + resistanceStrength * 0.2 + stabilityBonus) * regime.confidence;
        return { action: 'sell', strategy: `RangeBounce_Resistance_${regime.regime}`, confidence };
      }
    }
    
    // Strategy 4: Momentum Scalping
    if (this.config.strategyToggle.MomentumScalp && volatility > 2) {
      if (momentum > 2 && rsi > 40 && rsi < 65) {
        return { action: 'buy', strategy: 'MomentumScalp', confidence: 0.6 };
      }
      if (momentum < -2 && rsi > 35 && rsi < 60) {
        return { action: 'sell', strategy: 'MomentumScalp', confidence: 0.6 };
      }
    }
    
    // Strategy 3: Enhanced SMC-style reversal with volume confirmation
    if (this.config.strategyToggle.SMCReversal) {
      const priceChange = Math.abs(price - candles[candles.length - 2].c) / price;
      const nearRecentLow = price <= recentLow * 1.002;
      const nearRecentHigh = price >= recentHigh * 0.998;
      
      if (priceChange > this.config.smcThresh) {
        // Buy at support with oversold RSI and downward momentum (reversal setup)
        if (nearRecentLow && rsi < 35 && momentum < -2) {
          const reverseStrength = Math.abs(momentum) / 5;
          const confidence = Math.min(0.85, 0.65 + reverseStrength * 0.1);
          return { action: 'buy', strategy: 'SMCReversal', confidence };
        }
        
        // Sell at resistance with overbought RSI and upward momentum (reversal setup)
        if (nearRecentHigh && rsi > 65 && momentum > 2) {
          const reverseStrength = Math.abs(momentum) / 5;
          const confidence = Math.min(0.85, 0.65 + reverseStrength * 0.1);
          return { action: 'sell', strategy: 'SMCReversal', confidence };
        }
      }
    }
    
    return { action: 'hold', strategy: 'no_signal', confidence: 0 };
  }

  private applyQualityFilter(signal: { action: 'buy' | 'sell' | 'hold'; strategy: string; confidence: number }): { action: 'buy' | 'sell' | 'hold'; strategy: string; confidence: number } {
    // REGIME-AWARE CONFIDENCE THRESHOLDS
    const regime = this.state.currentRegime;
    let MIN_CONFIDENCE_THRESHOLD: number;
    
    if (regime?.regime === 'trending' || regime?.regime === 'volatile') {
      MIN_CONFIDENCE_THRESHOLD = 0.25; // Permissive in active markets
    } else if (regime?.regime === 'ranging') {
      MIN_CONFIDENCE_THRESHOLD = 0.35; // Moderate in ranging markets
    } else {
      MIN_CONFIDENCE_THRESHOLD = 0.45; // Strict in quiet markets
    }
    
    if (signal.action !== 'hold' && signal.confidence < MIN_CONFIDENCE_THRESHOLD) {
      logger.debug(`🚫 Quality filter: ${signal.strategy} signal rejected (conf: ${signal.confidence.toFixed(3)} < ${MIN_CONFIDENCE_THRESHOLD}) in ${regime?.regime || 'unknown'} market`);
      return { action: 'hold', strategy: 'low_confidence_filtered', confidence: 0 };
    }
    
    return signal;
  }

  // Execute trade in isolated environment
  private executeTrade(signal: any, candle: any): any | null {
    const positionKey = signal.symbol || 'default';
          const existingPosition = this.state.openPositions.get(positionKey);

    // ── QUIET-STRATEGY POSITION CAP ─────────────────────────────
    if (!existingPosition && signal.strategy && signal.strategy.includes('QuietMarket')) {
      const quietOpen = Array.from(this.state.openPositions.values()).filter(p => (p.strategy || '').includes('QuietMarket')).length;
      if (quietOpen >= 2) {
        logger.debug(`🚫 QuietMarket cap reached (${quietOpen}). Trade skipped.`);
        return null;
      }
    }

    // ── DAILY TRADE LIMITS (regime-aware) ──────────────────────
    const dayKey = new Date(candle.ts).toISOString().slice(0, 10);
    const todaysEntries = this.state.trades.filter(t => t.type === 'entry' && new Date(t.timestamp).toISOString().slice(0, 10) === dayKey).length;
    if (!existingPosition && this.state.currentRegime && this.state.currentRegime.regime === 'quiet' && todaysEntries >= 20) {
      logger.debug(`🚫 Daily trade cap in QUIET regime hit (${todaysEntries}).`);
      return null;
    }
    
    // 🎯 ENHANCED REGIME-AWARE POSITION SIZING
    let baseRiskPct = this.config.riskPct;
    
    // 🌊 REGIME-BASED POSITION SCALING (NEW!)
    let regimeMultiplier = 1.0;
    if (this.state.currentRegime) {
      const regime = this.state.currentRegime;
      
      if (regime.regime === 'trending') {
        // Trending markets: Scale with confidence and trend strength
        regimeMultiplier = 0.8 + (regime.confidence * 0.6) + (regime.trendStrength * 0.4);
        regimeMultiplier = Math.min(1.5, regimeMultiplier); // Cap at 1.5x
      } else if (regime.regime === 'ranging') {
        // Ranging markets: Good for mean reversion
        regimeMultiplier = 0.9 + (regime.confidence * 0.4);
        regimeMultiplier = Math.min(1.2, regimeMultiplier); // Cap at 1.2x
      } else if (regime.regime === 'volatile') {
        // Volatile markets: Reduce size significantly
        regimeMultiplier = 0.5 + (regime.confidence * 0.2);
        regimeMultiplier = Math.min(0.7, regimeMultiplier); // Cap at 0.7x
      } else if (regime.regime === 'quiet') {
        // Quiet markets: Safe to size up with high confidence
        regimeMultiplier = 0.8 + (regime.confidence * 0.5);
        regimeMultiplier = Math.min(1.3, regimeMultiplier); // Cap at 1.3x
      }
      
      baseRiskPct *= regimeMultiplier;
      logger.debug(`🎯 Regime adjustment: ${regimeMultiplier.toFixed(2)}x for ${regime.regime} (${(regime.confidence*100).toFixed(1)}% conf)`);
    }
    
    // 📊 SUPER-AGGRESSIVE CONFIDENCE-BASED SIZING (MAXIMIZE HIGH-CONFIDENCE TRADES)
    let confidenceMultiplier = 1.0;
    if (signal.confidence < 0.4) {
      confidenceMultiplier = 0.1; // Micro positions for very low confidence
    } else if (signal.confidence < 0.5) {
      confidenceMultiplier = 0.3; // Small positions for low confidence
    } else if (signal.confidence < 0.6) {
      confidenceMultiplier = 0.5; // Below-average confidence
    } else if (signal.confidence < 0.7) {
      confidenceMultiplier = 1.0; // Normal for average confidence
    } else if (signal.confidence < 0.8) {
      confidenceMultiplier = 2.0; // Double size for good confidence
    } else if (signal.confidence < 0.9) {
      confidenceMultiplier = 3.0; // Triple size for high confidence
    } else {
      confidenceMultiplier = 4.0; // Maximum size for very high confidence (90%+)
    }
    baseRiskPct *= confidenceMultiplier;
    
    // 🚀 ENHANCED STRATEGY-BASED SIZING (PRIORITIZE HIGH-QUALITY STRATEGIES)
    let strategyMultiplier = 1.0;
    if (signal.strategy.includes('TrendFollowMA_Bear')) {
      strategyMultiplier = 1.6; // Bear market shorts get highest priority
    } else if (signal.strategy.includes('TrendFollowMA_Bull')) {
      strategyMultiplier = 1.4; // Bull trend following high priority
    } else if (signal.strategy.includes('RSI_Oversold') || signal.strategy.includes('RSI_Overbought')) {
      strategyMultiplier = 1.2; // Strong RSI signals get boost
    } else if (signal.strategy.includes('RangeBounce')) {
      strategyMultiplier = 1.1; // Range bounce decent reliability
    } else if (signal.strategy.includes('QuietMarket')) {
      strategyMultiplier = 0.0; // Quiet market signals DISABLED - no edge detected
    } else if (signal.strategy.includes('WeakTrend')) {
      strategyMultiplier = 0.8; // Weak trend signals reduced
    } else if (signal.strategy.includes('SMC')) {
      strategyMultiplier = 0.5; // SMC heavily reduced (disabled anyway)
    }
    baseRiskPct *= strategyMultiplier;
    
    // 🔗 CORRELATION ANALYSIS (NEW!)
    const correlationAnalysis = this.correlationManager.analyzePositionCorrelation(
      positionKey, 
      this.state.openPositions
    );
    
    if (correlationAnalysis.wouldExceedCorrelationLimit) {
      logger.debug(`❌ Trade blocked: ${correlationAnalysis.reason}`);
      return null; // Block highly correlated positions
    }
    
    // Apply correlation-based size reduction
    baseRiskPct *= correlationAnalysis.recommendedSizeReduction;
    if (correlationAnalysis.recommendedSizeReduction < 1.0) {
      logger.debug(`🔗 Correlation adjustment: ${correlationAnalysis.recommendedSizeReduction.toFixed(2)}x (${correlationAnalysis.reason})`);
    }
    
    // 🎪 DIVERSIFICATION ADJUSTMENT (Enhanced with correlation score)
    const openPositionCount = this.state.openPositions.size;
    const diversificationScore = this.correlationManager.getPortfolioDiversificationScore(this.state.openPositions);
    
    if (openPositionCount > 0) {
      // Combine position count and correlation-based diversification
      const countMultiplier = Math.max(0.4, 1 - (openPositionCount * 0.15));
      const correlationMultiplier = 0.7 + (diversificationScore * 0.3); // 0.7-1.0 range
      const diversificationMultiplier = countMultiplier * correlationMultiplier;
      
      baseRiskPct *= diversificationMultiplier;
      logger.debug(`🎪 Diversification: ${diversificationMultiplier.toFixed(2)}x (${openPositionCount} positions, ${(diversificationScore*100).toFixed(1)}% diversified)`);
    }
    
    // 📈 ENHANCED RECENT PERFORMANCE ADJUSTMENT
    const recentPerformanceTrades = this.state.trades.slice(-15).filter(t => t.type === 'exit');
    if (recentPerformanceTrades.length >= 8) {
      const recentWinRate = recentPerformanceTrades.filter(t => t.pnl > 0).length / recentPerformanceTrades.length;
      const recentPnL = recentPerformanceTrades.reduce((sum, t) => sum + t.pnl, 0);
      
      let performanceMultiplier = 1.0;
      if (recentWinRate > 0.65 && recentPnL > 5) {
        performanceMultiplier = 1.3; // Increase size when doing very well
      } else if (recentWinRate > 0.5 && recentPnL > 0) {
        performanceMultiplier = 1.15; // Slight increase for decent performance
      } else if (recentWinRate < 0.25 || recentPnL < -15) {
        performanceMultiplier = 0.6; // Reduce size when struggling badly
      } else if (recentWinRate < 0.35) {
        performanceMultiplier = 0.8; // Moderate reduction for poor performance
      }
      
      baseRiskPct *= performanceMultiplier;
      logger.debug(`📈 Performance adjustment: ${performanceMultiplier.toFixed(2)}x (WR: ${(recentWinRate*100).toFixed(1)}%, PnL: $${recentPnL.toFixed(2)})`);
    }
    
    // ── TREND-FOLLOW SIZE BOOST ────────────────────────────────
    if (this.state.currentRegime && this.state.currentRegime.regime === 'trending' && this.state.currentRegime.confidence > 0.6 && signal.strategy && signal.strategy.includes('TrendFollowMA')) {
      baseRiskPct *= 1.2; // 20% boost for high-confidence trends
    }
    
    const positionValue = this.state.equity * baseRiskPct;
    
    // Validate candle data
    if (!candle || !candle.c || candle.c <= 0) {
      logger.debug(`❌ Trade blocked: invalid candle data (close: ${candle?.c})`);
      return null;
    }
    
    const quantity = positionValue / candle.c;
    
    // Validate calculated values
    if (!isFinite(quantity) || quantity <= 0 || !isFinite(positionValue) || positionValue <= 0) {
      logger.debug(`❌ Trade blocked: invalid calculations (quantity: ${quantity}, positionValue: ${positionValue})`);
      return null;
    }
    
    // Enhanced risk check before trade
    if (!this.checkRisk(positionValue)) {
      logger.debug(`❌ Trade blocked by risk check`);
      return null; // Trade blocked by risk management
    }
    
    // Relaxed losing streak protection - allow more trades through
    const recentTrades = this.state.trades.slice(-8).filter(t => t.type === 'exit');
    const losingStreak = recentTrades.length >= 5 && recentTrades.every(t => t.pnl < 0);
    if (losingStreak && signal.confidence < 0.5) {
      logger.debug(`❌ Trade blocked by losing streak (confidence: ${signal.confidence})`);
      return null; // Skip only very low confidence trades during losing streak
    }
    
    const fee = positionValue * 0.001; // 0.1% fee
    const trade: any = {
      id: Date.now() + Math.random(),
      symbol: positionKey,
      timestamp: candle.ts,
      price: candle.c,
      quantity,
      fee,
      strategy: signal.strategy,
      confidence: signal.confidence
    };
    
    if (!existingPosition && signal.action !== 'hold') {
      // 🚀 OPEN NEW POSITION (LONG OR SHORT)
      trade.side = signal.action;
      trade.type = 'entry';
      trade.pnl = -fee; // Entry fee is a cost
      
      this.state.openPositions.set(positionKey, {
        side: signal.action,
        entryPrice: candle.c,
        quantity,
        entryFee: fee,
        entryTime: candle.ts,
        strategy: signal.strategy,
        highestPrice: candle.c,   // watermark for longs
        lowestPrice: candle.c,    // watermark for shorts
        symbol: positionKey
      });
      
      // 💰 CASH MANAGEMENT: Different for longs vs shorts
      if (signal.action === 'buy') {
        // LONG: Pay cash for the asset
        this.state.cash -= positionValue + fee;
      } else {
        // SHORT: Receive cash from borrowing (simplified margin model)
        this.state.cash += positionValue - fee; // Get cash from short sale, minus fee
      }
      
      this.state.trades.push(trade);
      
      const actionEmoji = signal.action === 'buy' ? '🟢' : '🔴';
      const regimeDisplay = this.state.currentRegime ? ` [${this.state.currentRegime.regime.toUpperCase()}]` : '';
      logger.debug(`${actionEmoji} OPENED ${signal.action.toUpperCase()} position: ${quantity.toFixed(4)} @ $${candle.c.toFixed(2)}${regimeDisplay}`);
      
      return trade;
      
    } else if (existingPosition) {
      // 🔄 CLOSE EXISTING POSITION if signal is opposite or confidence is low
      const shouldClose = (existingPosition.side === 'buy' && signal.action === 'sell') ||
                         (existingPosition.side === 'sell' && signal.action === 'buy') ||
                         signal.confidence < this.config.gatekeeperThresh;
      
      if (shouldClose) {
        // 📊 CALCULATE PnL (CORRECT FOR BOTH LONGS AND SHORTS)
        let pnl = 0;
        if (existingPosition.side === 'buy') {
          // LONG: Profit when price goes up
          pnl = (candle.c - existingPosition.entryPrice) * existingPosition.quantity;
        } else {
          // SHORT: Profit when price goes down
          pnl = (existingPosition.entryPrice - candle.c) * existingPosition.quantity;
        }
        pnl -= (existingPosition.entryFee + fee); // Subtract both entry and exit fees
        
        trade.side = existingPosition.side === 'buy' ? 'sell' : 'buy';
        trade.type = 'exit';
        trade.pnl = pnl;
        trade.entryPrice = existingPosition.entryPrice;
        trade.holdTime = candle.ts - existingPosition.entryTime;
        
        // 💰 CASH MANAGEMENT: Different for closing longs vs shorts
        if (existingPosition.side === 'buy') {
          // CLOSING LONG: Sell asset for cash
          this.state.cash += (existingPosition.quantity * candle.c) - fee;
        } else {
          // CLOSING SHORT: Buy back to cover short
          this.state.cash -= (existingPosition.quantity * candle.c) + fee;
        }
        
        this.state.dayPnL += pnl;
        this.state.totalPnL += pnl;
        this.state.equity = this.startingEquity + this.state.totalPnL;
        
        this.state.openPositions.delete(positionKey);
        this.state.trades.push(trade);
        
        const pnlEmoji = pnl > 0 ? '✅' : '❌';
        const actionEmoji = existingPosition.side === 'buy' ? '🟢→⚪' : '🔴→⚪';
        logger.debug(`${actionEmoji} CLOSED ${existingPosition.side.toUpperCase()}: PnL $${pnl.toFixed(2)} ${pnlEmoji}`);
        
        return trade;
      }
    }
    
    return null;
  }

  // Run isolated backtest for a symbol
  async runSymbolBacktest(symbol: string, startDate: string, endDate: string): Promise<BacktestResults> {
    logger.info(`🔄 Running isolated backtest for ${symbol} from ${startDate} to ${endDate}`);
    
    try {
      const feed = new PolygonDataFeed(symbol);
      const candles: any[] = [];
      
      // Collect all candles first
      for await (const candle of feed.iterate(startDate, endDate)) {
        candles.push(candle);
      }
      
      logger.info(`📊 Processing ${candles.length} candles for ${symbol}`);
      
      if (candles.length === 0) {
        logger.warn(`No candles found for ${symbol}`);
        // Return empty results
        return {
          symbol,
          trades: 0,
          pnl: 0,
          winRate: 0,
          maxDrawdown: 0,
          sharpeRatio: 0,
          totalReturn: 0,
          riskBreachRate: 0,
          avgTradeSize: 0,
          avgHoldTime: 0
        };
      }
      
      let maxEquity = this.startingEquity;
      let minEquity = this.startingEquity;
      let signalCount = 0;
      let tradeAttempts = 0;
      
      // Process each candle
      for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];
        const indicators = this.calculateIndicators(candles.slice(0, i + 1));
        
        if (indicators) {
          const rawSignal = this.generateSignal(indicators, candles.slice(0, i + 1));
          let signal = this.applyQualityFilter(rawSignal);
          
          // ── MOMENTUM CONFIRMATION REQUIREMENT ─────────────────────────
          if (signal.action !== 'hold') {
            const momentum = indicators.momentum || 0;
            const momentumThreshold = 0.3; // Require meaningful momentum
            
            if (signal.action === 'buy' && momentum < momentumThreshold) {
              logger.debug(`🚫 Momentum filter: BUY signal rejected (momentum: ${momentum.toFixed(3)} < ${momentumThreshold})`);
              signal = { action: 'hold', strategy: 'momentum_filtered', confidence: 0 };
            }
            if (signal.action === 'sell' && momentum > -momentumThreshold) {
              logger.debug(`🚫 Momentum filter: SELL signal rejected (momentum: ${momentum.toFixed(3)} > ${-momentumThreshold})`);
              signal = { action: 'hold', strategy: 'momentum_filtered', confidence: 0 };
            }
          }

                     // ── REGIME-SPECIFIC ENTRY REQUIREMENTS ─────────────────────────
           if (signal.action !== 'hold') {
             const recentCandles = candles.slice(Math.max(0, i - 100), i + 1);
             const regimeInput = {
               atr: (indicators.atr || 0) / candle.c,
               adx: Math.abs(indicators.momentum || 0) * 10,
               rsi: indicators.rsi || 50,
               bbWidth: (indicators.atr || 0) / candle.c,
               recentTrend: ((indicators.sma50 || candle.c) - (indicators.sma200 || candle.c)) / candle.c,
               currentPrice: candle.c,
               symbol: 'BACKTEST'
             };
             const regime = this.regimeDetector.detectRegime(regimeInput);
             
             if (regime.regime === 'quiet' && signal.confidence < 0.6) {
               logger.debug(`🚫 Regime filter: QUIET market requires confidence > 0.6 (got ${signal.confidence.toFixed(3)})`);
               signal = { action: 'hold', strategy: 'regime_filtered', confidence: 0 };
             }
             if (regime.regime === 'volatile' && signal.confidence < 0.5) {
               logger.debug(`🚫 Regime filter: VOLATILE market requires confidence > 0.5 (got ${signal.confidence.toFixed(3)})`);
               signal = { action: 'hold', strategy: 'regime_filtered', confidence: 0 };
             }
           }
          
          if (signal.action !== 'hold') {
            signalCount++;
            logger.debug(`Signal ${signalCount}: ${signal.action} ${signal.strategy} (confidence: ${signal.confidence.toFixed(2)})`);
            
            const trade = this.executeTrade({ ...signal, symbol }, candle);
            tradeAttempts++;
            
            if (trade) {
              const pnl = trade.pnl !== undefined ? trade.pnl.toFixed(2) : '0.00';
              const quantity = trade.quantity !== undefined ? trade.quantity.toFixed(4) : '0.0000';
              const price = trade.price !== undefined ? trade.price.toFixed(2) : '0.00';
              logger.debug(`Trade executed: ${trade.side} ${quantity} @ $${price}, PnL: $${pnl}`);
            } else {
              logger.debug(`Trade blocked by risk management`);
            }
          }
        }
        
        // Track drawdown
        maxEquity = Math.max(maxEquity, this.state.equity);
        minEquity = Math.min(minEquity, this.state.equity);
      }
      
      logger.info(`📈 Generated ${signalCount} signals, attempted ${tradeAttempts} trades`);
      
      // 🔒 FORCE-CLOSE ANY REMAINING OPEN POSITIONS AT LAST PRICE
      if (this.state.openPositions.size > 0) {
        for (const [posKey, pos] of this.state.openPositions) {
          const sideOpp = pos.side === 'buy' ? 'sell' : 'buy';
          const fakeSignal = { action: sideOpp, strategy: 'forced_exit', confidence: 1, symbol };
          this.executeTrade(fakeSignal, candles[candles.length - 1]);
        }
      }
      
      const completedTrades = this.state.trades.filter(t => t.type === 'exit');
      const winningTrades = completedTrades.filter(t => t.pnl > 0);
      
      // Calculate results
      const winRate = completedTrades.length > 0 ? (winningTrades.length / completedTrades.length) * 100 : 0;
      const maxDrawdown = ((maxEquity - minEquity) / maxEquity) * 100;
      const totalReturn = ((this.state.equity - this.startingEquity) / this.startingEquity) * 100;
      const riskBreachRate = this.state.totalRiskChecks > 0 ? (this.state.riskBreaches / this.state.totalRiskChecks) * 100 : 0;
      
      const avgTradeSize = completedTrades.length > 0 ? 
        completedTrades.reduce((sum, t) => sum + Math.abs(t.pnl), 0) / completedTrades.length : 0;
      
      const avgHoldTime = completedTrades.length > 0 ?
        completedTrades.reduce((sum, t) => sum + (t.holdTime || 0), 0) / completedTrades.length : 0;
      
      // Calculate Sharpe ratio (simplified)
      const returns = completedTrades.map(t => t.pnl / this.startingEquity);
      const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b) / returns.length : 0;
      const returnStdDev = returns.length > 1 ? 
        Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1)) : 0;
      const sharpeRatio = returnStdDev > 0 ? avgReturn / returnStdDev : 0;
      
      return {
        symbol,
        trades: completedTrades.length,
        pnl: this.state.totalPnL,
        winRate,
        maxDrawdown,
        sharpeRatio,
        totalReturn,
        riskBreachRate,
        avgTradeSize,
        avgHoldTime
      };
      
    } catch (error) {
      logger.error(`❌ Error backtesting ${symbol}:`, error);
      if (error instanceof Error) {
        logger.error(`Error message: ${error.message}`);
        logger.error(`Stack trace: ${error.stack}`);
      }
      return {
        symbol,
        trades: 0,
        pnl: 0,
        winRate: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        totalReturn: 0,
        riskBreachRate: 100,
        avgTradeSize: 0,
        avgHoldTime: 0
      };
    }
  }
}

// 🎯 ASSET-SPECIFIC OPTIMIZATION CONFIGS
const getAssetSpecificConfig = (symbol: string): BacktestConfig => {
  const baseConfig = {
    maxDailyLoss: 0.015,
    maxOpenRisk: 0.03,
    atrPeriod: 14,
    timeBasedExitHours: 48, // Extended to let winners breathe
  };

  switch (symbol) {
    case 'TSLA': // Best performer (25.5% win rate) - optimize for more aggressive trading
      return {
        ...baseConfig,
        riskPct: 0.10, // More aggressive (best performer)
        smcThresh: 0.0008, // More opportunities
        rsiOS: 22, // Slightly more selective than base
        rsiOB: 78,
        atrMultiple: 1.2, // Slightly wider stop to account for volatility
        gatekeeperThresh: 0.40, // Lower threshold for more trades
        fastMAPeriod: 18, // Faster response
        slowMAPeriod: 50,
        strategyToggle: {
          TrendFollowMA: true,
          RangeBounce: true,
          SMCReversal: true, // Re-enable for best performer
          MomentumScalp: false
        }
      };
    
    case 'NVDA': // Long hold times (51.8h) - optimize for faster exits
      return {
        ...baseConfig,
        riskPct: 0.05,          // larger winners, but
        smcThresh: 0.0012,
        rsiOS: 20, // More aggressive entries
        rsiOB: 80,
        atrMultiple: 0.8,       // tighter stop for faster exits
        gatekeeperThresh: 0.42, // Higher quality signals
        fastMAPeriod: 16, // Faster exits
        slowMAPeriod: 45,
        strategyToggle: {
          TrendFollowMA: true,
          RangeBounce: false, // NVDA trends strongly
          SMCReversal: true,
          MomentumScalp: false
        }
      };
    
    case 'X:BTCUSD': // Worst performer (16.4% win rate) - very conservative
      return {
        ...baseConfig,
        riskPct: 0.06, // Much more conservative
        smcThresh: 0.002, // Much more selective
        rsiOS: 18, // Very selective entries
        rsiOB: 82,
        atrMultiple: 2.2, // Wider stops for crypto volatility
        gatekeeperThresh: 0.50, // High quality only
        fastMAPeriod: 25, // Slower, more stable
        slowMAPeriod: 65,
        strategyToggle: {
          TrendFollowMA: true,
          RangeBounce: false, // Crypto trends strongly
          SMCReversal: false, // Poor performance
          MomentumScalp: false
        }
      };
    
    case 'META': // Lowest win rate (13.9%) - focus on quality over quantity
      return {
        ...baseConfig,
        riskPct: 0.07,
        smcThresh: 0.0018,
        rsiOS: 15, // Very selective
        rsiOB: 85,
        atrMultiple: 2.0, // Wider stops for volatility
        gatekeeperThresh: 0.48, // Higher quality threshold
        fastMAPeriod: 24, // More stable signals
        slowMAPeriod: 60,
        strategyToggle: {
          TrendFollowMA: true,
          RangeBounce: true, // META can range
          SMCReversal: false,
          MomentumScalp: false
        }
      };
    
    default: // Fallback configuration
      return {
        ...baseConfig,
        riskPct: 0.08,
        smcThresh: 0.0015,
        rsiOS: 25,
        rsiOB: 75,
        atrMultiple: 1.8,
        gatekeeperThresh: 0.45,
        fastMAPeriod: 21,
        slowMAPeriod: 55,
        strategyToggle: {
          TrendFollowMA: true,
          RangeBounce: true,
          SMCReversal: false,
          MomentumScalp: false
        }
      };
  }
};

// Final optimized configuration based on comprehensive testing
const getOptimizedConfig = (): BacktestConfig => ({
  riskPct: 0.12, // 12% risk per trade (more aggressive for high-confidence trades)
  maxDailyLoss: 0.025, // 2.5% daily loss limit (higher for more trades)
  maxOpenRisk: 0.05, // 5% open risk limit (higher for better utilization)
  smcThresh: 0.0015, // Slightly higher SMC threshold for quality
  rsiOS: 25, // More responsive oversold (better signal frequency)
  rsiOB: 75, // More responsive overbought (better signal frequency)
  atrMultiple: 1.8, // Balanced stop losses (not too tight, not too loose)
  atrPeriod: 14,
  gatekeeperThresh: 0.45, // Slightly higher confidence threshold
  fastMAPeriod: 21, // Faster MA for more responsive signals
  slowMAPeriod: 55, // Shorter slow MA for better trend detection
  strategyToggle: {
    TrendFollowMA: true,
    RangeBounce: true, // Re-enable for ranging markets
    SMCReversal: false, // Keep disabled (inconsistent)
    MomentumScalp: false // Keep disabled (too noisy)
  },
  timeBasedExitHours: 24,
});

// Main isolated backtest function
async function runIsolatedBacktest(options: {
  symbol?: string;
  symbols?: string[];
  startDate?: string;
  endDate?: string;
  randomPeriod?: boolean;
  periodDays?: number;
}): Promise<void> {
  const config = getOptimizedConfig();
  
  // Setup output directory
  const outputDir = path.join(process.cwd(), 'data', 'isolated_backtest_results');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Determine symbols
  let symbols: string[] = [];
  if (options.symbols) {
    symbols = options.symbols;
  } else if (options.symbol) {
    symbols = [options.symbol];
  } else {
    symbols = ['X:BTCUSD']; // Default
  }
  
  // Determine date range
  let startDate: string, endDate: string;
  if (options.randomPeriod) {
    const days = options.periodDays || 7;
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    startDate = start.toISOString().split('T')[0];
    endDate = end.toISOString().split('T')[0];
    logger.info(`🎲 Random ${days}-day period: ${startDate} to ${endDate}`);
  } else if (options.startDate && options.endDate) {
    startDate = options.startDate;
    endDate = options.endDate;
  } else {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    startDate = start.toISOString().split('T')[0];
    endDate = end.toISOString().split('T')[0];
  }
  
  logger.info(`📅 Backtest period: ${startDate} to ${endDate}`);
  logger.info(`🎯 Testing ${symbols.length} symbols with optimized configuration`);
  
  // Run backtests
  const results: BacktestResults[] = [];
  
  for (const symbol of symbols) {
    try {
      // 🎯 Use asset-specific optimized configuration
      const assetConfig = getAssetSpecificConfig(symbol);
      const engine = new IsolatedBacktestEngine(assetConfig);
      const result = await engine.runSymbolBacktest(symbol, startDate, endDate);
      results.push(result);
      
      logger.info(`✅ ${symbol}: ${result.trades} trades, PnL: $${result.pnl}, Win Rate: ${result.winRate}%, Risk Breach: ${result.riskBreachRate}%`);
      logger.info(`   📊 Config: Risk=${assetConfig.riskPct*100}%, RSI=${assetConfig.rsiOS}-${assetConfig.rsiOB}, ATR=${assetConfig.atrMultiple}x`);
      
    } catch (error) {
      logger.error(`❌ Error backtesting ${symbol}:`, error);
      results.push({
        symbol,
        trades: 0,
        pnl: 0,
        winRate: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        totalReturn: 0,
        riskBreachRate: 100,
        avgTradeSize: 0,
        avgHoldTime: 0
      });
    }
  }
  
  // Generate summary
  const totalPnL = results.reduce((sum, r) => sum + r.pnl, 0);
  const totalTrades = results.reduce((sum, r) => sum + r.trades, 0);
  const avgWinRate = results.length > 0 ? results.reduce((sum, r) => sum + r.winRate, 0) / results.length : 0;
  const avgRiskBreach = results.length > 0 ? results.reduce((sum, r) => sum + r.riskBreachRate, 0) / results.length : 0;
  
  // Save results
  fs.writeFileSync(
    path.join(outputDir, 'isolated_backtest_summary.json'),
    JSON.stringify({ results, summary: { totalPnL, totalTrades, avgWinRate, avgRiskBreach } }, null, 2)
  );
  
  // Display results
  console.log('\n📊 ISOLATED BACKTEST RESULTS:');
  console.log('=' .repeat(80));
  console.table(results);
  
  console.log(`\n💰 Total PnL: $${totalPnL.toFixed(2)}`);
  console.log(`📈 Total Trades: ${totalTrades}`);
  console.log(`🎯 Average Win Rate: ${avgWinRate.toFixed(1)}%`);
  console.log(`⚠️ Average Risk Breach Rate: ${avgRiskBreach.toFixed(1)}%`);
  console.log(`📁 Results saved to: ${outputDir}`);
  
  // Recommendations
  console.log('\n💡 OPTIMIZATION RECOMMENDATIONS:');
  if (avgRiskBreach > 10) {
    console.log('  🔴 High risk breach rate - consider reducing position sizes');
  }
  if (avgWinRate < 40) {
    console.log('  🔴 Low win rate - strategy parameters need refinement');
  }
  if (totalPnL < 0) {
    console.log('  🔴 Negative total PnL - strategy is not profitable in this period');
  }
  if (avgRiskBreach < 5 && avgWinRate > 50 && totalPnL > 0) {
    console.log('  🟢 Good performance - strategy parameters are well optimized');
  }
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: any = {};
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--symbol':
      case '-s':
        options.symbol = args[++i];
        break;
      case '--symbols':
        options.symbols = args[++i].split(',');
        break;
      case '--start':
        options.startDate = args[++i];
        break;
      case '--end':
        options.endDate = args[++i];
        break;
      case '--random':
      case '-r':
        options.randomPeriod = true;
        break;
      case '--days':
      case '-d':
        options.periodDays = parseInt(args[++i]);
        break;
      case '--help':
      case '-h':
        console.log(`
🚀 Isolated Backtest Engine

This backtest runs completely isolated from production database and state.
No risk of interfering with live trading or account state.

Usage: npm run backtest-isolated [options]

Options:
  -s, --symbol <symbol>     Single symbol to backtest
  --symbols <sym1,sym2>     Multiple symbols (comma-separated)
  --start <YYYY-MM-DD>      Start date
  --end <YYYY-MM-DD>        End date
  -r, --random              Use random period
  -d, --days <number>       Period length in days (default: 7)
  -h, --help                Show this help

Examples:
  npm run backtest-isolated -s X:BTCUSD -r -d 3
  npm run backtest-isolated --symbols AAPL,TSLA,NVDA,X:BTCUSD --start 2024-01-01 --end 2024-01-07
        `);
        process.exit(0);
        break;
    }
  }
  
  await runIsolatedBacktest(options);
}

// Export for use in other scripts
export { runIsolatedBacktest, IsolatedBacktestEngine };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => {
      console.log('\n✅ Isolated backtest completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Error during isolated backtest:', error);
      process.exit(1);
    });
} 