import type { MarketRegimeAnalysis } from '../marketRegimeDetector.js';

export interface RegimeThresholds {
  rsi: {
    oversold: number;
    overbought: number;
    neutral_min: number;
    neutral_max: number;
  };
  adx: {
    trending_min: number;
    strong_trend_min: number;
  };
  atr: {
    low_volatility_max: number;
    high_volatility_min: number;
  };
  confidence: {
    min_entry: number;
    high_quality: number;
  };
  position: {
    risk_multiplier: number;
    max_risk_pct: number;
  };
}

export class RegimeConfigManager {
  
  /**
   * Get optimized thresholds based on current market regime
   */
  static getThresholds(regime: MarketRegimeAnalysis): RegimeThresholds {
    const baseConfig = this.getBaseThresholds();
    
    switch (regime.regime) {
      case 'trending':
        return this.getTrendingThresholds(baseConfig, regime);
      case 'ranging':
        return this.getRangingThresholds(baseConfig, regime);
      case 'volatile':
        return this.getVolatileThresholds(baseConfig, regime);
      case 'quiet':
        return this.getQuietThresholds(baseConfig, regime);
      default:
        return baseConfig;
    }
  }
  
  private static getBaseThresholds(): RegimeThresholds {
    return {
      rsi: {
        oversold: 30,
        overbought: 70,
        neutral_min: 40,
        neutral_max: 60,
      },
      adx: {
        trending_min: 20,
        strong_trend_min: 30,
      },
      atr: {
        low_volatility_max: 0.008,
        high_volatility_min: 0.020,
      },
      confidence: {
        min_entry: 0.5,
        high_quality: 0.8,
      },
      position: {
        risk_multiplier: 1.0,
        max_risk_pct: 0.02,
      }
    };
  }
  
  private static getTrendingThresholds(base: RegimeThresholds, regime: MarketRegimeAnalysis): RegimeThresholds {
    const stability = regime.regimeStability;
    const confidence = regime.confidence;
    
    return {
      rsi: {
        // More relaxed RSI in trending markets (trend continuation bias)
        oversold: Math.max(20, base.rsi.oversold - (stability * 10)),
        overbought: Math.min(80, base.rsi.overbought + (stability * 10)),
        neutral_min: base.rsi.neutral_min - 5,
        neutral_max: base.rsi.neutral_max + 5,
      },
      adx: {
        // Lower ADX requirements in confirmed trending regimes
        trending_min: Math.max(15, base.adx.trending_min - (confidence * 5)),
        strong_trend_min: Math.max(20, base.adx.strong_trend_min - (confidence * 8)),
      },
      atr: {
        // Accept higher volatility in trending markets
        low_volatility_max: base.atr.low_volatility_max * 1.5,
        high_volatility_min: base.atr.high_volatility_min * 0.8,
      },
      confidence: {
        // Lower confidence threshold for trend continuation
        min_entry: Math.max(0.4, base.confidence.min_entry - (stability * 0.15)),
        high_quality: Math.max(0.65, base.confidence.high_quality - (stability * 0.1)),
      },
      position: {
        // Larger positions in stable trending markets
        risk_multiplier: 1.0 + (stability * confidence * 0.5),
        max_risk_pct: base.position.max_risk_pct * (1.0 + stability * 0.3),
      }
    };
  }
  
  private static getRangingThresholds(base: RegimeThresholds, regime: MarketRegimeAnalysis): RegimeThresholds {
    const stability = regime.regimeStability;
    const confidence = regime.confidence;
    
    return {
      rsi: {
        // Tighter RSI extremes for range bounces
        oversold: Math.min(35, base.rsi.oversold + (stability * 8)),
        overbought: Math.max(65, base.rsi.overbought - (stability * 8)),
        neutral_min: base.rsi.neutral_min + 3,
        neutral_max: base.rsi.neutral_max - 3,
      },
      adx: {
        // Higher ADX requirements to avoid false ranging signals
        trending_min: base.adx.trending_min + 5,
        strong_trend_min: base.adx.strong_trend_min + 8,
      },
      atr: {
        // Prefer lower volatility for clean range bounces
        low_volatility_max: base.atr.low_volatility_max * 0.7,
        high_volatility_min: base.atr.high_volatility_min * 1.2,
      },
      confidence: {
        // Higher confidence required for range trades
        min_entry: Math.min(0.7, base.confidence.min_entry + (stability * 0.1)),
        high_quality: Math.min(0.9, base.confidence.high_quality + (stability * 0.05)),
      },
      position: {
        // Moderate positions in ranging markets
        risk_multiplier: 0.8 + (stability * 0.3),
        max_risk_pct: base.position.max_risk_pct * 0.9,
      }
    };
  }
  
  private static getVolatileThresholds(base: RegimeThresholds, regime: MarketRegimeAnalysis): RegimeThresholds {
    const stability = regime.regimeStability;
    const confidence = regime.confidence;
    
    return {
      rsi: {
        // Extreme RSI levels needed in volatile markets
        oversold: Math.max(15, base.rsi.oversold - 10),
        overbought: Math.min(85, base.rsi.overbought + 10),
        neutral_min: base.rsi.neutral_min - 8,
        neutral_max: base.rsi.neutral_max + 8,
      },
      adx: {
        // Much higher ADX requirements for volatile regime confirmation
        trending_min: base.adx.trending_min + 10,
        strong_trend_min: base.adx.strong_trend_min + 15,
      },
      atr: {
        // Expect and handle high volatility
        low_volatility_max: base.atr.low_volatility_max * 2.0,
        high_volatility_min: base.atr.high_volatility_min * 0.6,
      },
      confidence: {
        // Much higher confidence required in volatile conditions
        min_entry: Math.min(0.8, base.confidence.min_entry + 0.2),
        high_quality: Math.min(0.95, base.confidence.high_quality + 0.1),
      },
      position: {
        // Smaller positions due to higher risk
        risk_multiplier: 0.5 + (stability * 0.3),
        max_risk_pct: base.position.max_risk_pct * 0.6,
      }
    };
  }
  
  private static getQuietThresholds(base: RegimeThresholds, regime: MarketRegimeAnalysis): RegimeThresholds {
    const stability = regime.regimeStability;
    const confidence = regime.confidence;
    
    return {
      rsi: {
        // More sensitive RSI in quiet markets
        oversold: Math.min(40, base.rsi.oversold + 8),
        overbought: Math.max(60, base.rsi.overbought - 8),
        neutral_min: base.rsi.neutral_min + 5,
        neutral_max: base.rsi.neutral_max - 5,
      },
      adx: {
        // Lower ADX requirements in quiet markets
        trending_min: Math.max(10, base.adx.trending_min - 8),
        strong_trend_min: Math.max(15, base.adx.strong_trend_min - 12),
      },
      atr: {
        // Very low volatility expected
        low_volatility_max: base.atr.low_volatility_max * 0.5,
        high_volatility_min: base.atr.high_volatility_min * 1.5,
      },
      confidence: {
        // Moderate confidence acceptable in quiet conditions
        min_entry: Math.max(0.45, base.confidence.min_entry - 0.05),
        high_quality: Math.max(0.7, base.confidence.high_quality - 0.05),
      },
      position: {
        // Larger positions acceptable in stable quiet markets
        risk_multiplier: 1.2 + (stability * 0.4),
        max_risk_pct: base.position.max_risk_pct * (1.0 + stability * 0.2),
      }
    };
  }
  
  /**
   * Get asset-specific adjustments to regime thresholds
   */
  static getAssetAdjustment(symbol: string): Partial<RegimeThresholds> {
    // Asset-specific optimizations based on our backtest analysis
    switch (true) {
      case symbol.includes('BTC'):
      case symbol.includes('ETH'):
      case symbol.includes('SOL'):
        // Crypto adjustments - more volatile, need tighter controls
        return {
          rsi: {
            oversold: 25,
            overbought: 75,
            neutral_min: 35,
            neutral_max: 65,
          },
          confidence: {
            min_entry: 0.6,
            high_quality: 0.85,
          },
          position: {
            risk_multiplier: 0.8,
            max_risk_pct: 0.015,
          }
        };
        
      case symbol === 'TSLA':
        // TSLA - high volatility stock, needs special handling
        return {
          atr: {
            low_volatility_max: 0.012,
            high_volatility_min: 0.035,
          },
          confidence: {
            min_entry: 0.55,
            high_quality: 0.8,
          },
          position: {
            risk_multiplier: 0.9,
            max_risk_pct: 0.018,
          }
        };
        
      case symbol === 'NVDA':
      case symbol === 'META':
        // Tech stocks - correlation considerations
        return {
          confidence: {
            min_entry: 0.52,
            high_quality: 0.78,
          },
          position: {
            risk_multiplier: 0.95,
            max_risk_pct: 0.019,
          }
        };
        
      default:
        return {};
    }
  }
  
  /**
   * Merge base regime thresholds with asset-specific adjustments
   */
  static getFinalThresholds(regime: MarketRegimeAnalysis, symbol: string): RegimeThresholds {
    const regimeThresholds = this.getThresholds(regime);
    const assetAdjustments = this.getAssetAdjustment(symbol);
    
    // Deep merge the configurations
    return this.deepMerge(regimeThresholds, assetAdjustments);
  }
  
  private static deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }
} 