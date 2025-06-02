// This file tests the new strategies added in sprint 6
import { TrendFollowMA } from '../src/bots/hypertrades/strategies/trendFollow.js';
import { RangeBounce } from '../src/bots/hypertrades/strategies/rangeBounce.js';
import { IndicatorCache } from '../src/bots/hypertrades/indicators/cache.js';
import { Perception, Candle } from '../src/bots/hypertrades/perception.js';

describe('Strategy Tests', () => {
  let perception: Perception;
  let indCache: IndicatorCache;
  let mockCandle: Candle;
  let mockConfig: any;
  
  beforeEach(() => {
    perception = new Perception();
    indCache = new IndicatorCache();
    
    // Add some candles to perception
    for (let i = 0; i < 20; i++) {
      const basePrice = 30000 + i * 100;
      const timestamp = Date.now() - (20 - i) * 60000;
      
      // Add ticks to populate the candles
      perception.addTick(basePrice, timestamp);
      perception.addTick(basePrice + 50, timestamp + 10000);  // High
      perception.addTick(basePrice - 50, timestamp + 20000);  // Low
      perception.addTick(basePrice + 25, timestamp + 30000);  // Close
      
      // Update indicators
      indCache.updateOnClose(basePrice + 25);
    }
    
    // Create a mock candle for testing
    mockCandle = {
      o: 31500,
      h: 31550,
      l: 31450,
      c: 31525,
      ts: Date.now()
    };
    
    // Mock config
    mockConfig = {
      symbols: ['bitcoin'],
      smc: { thresh: 0.002, minRetrace: 0.5 },
      ta: { rsiPeriod: 14, overSold: 30, overBought: 70 },
      riskPct: 1,
      symbol: 'bitcoin',
      strategyToggle: {
        bitcoin: {
          trendFollowMA: true,
          rangeBounce: true
        }
      }
    };
  });
  
  describe('TrendFollowMA Strategy', () => {
    test('should generate buy signal when price pulls back to fast MA in uptrend', () => {
      const strategy = new TrendFollowMA('bitcoin');
      
      // Manually set MAs to simulate an uptrend
      indCache.fastMA = 31500;
      indCache.slowMA = 31000;
      
      // Set current price close to fastMA (within 0.2%)
      mockCandle.c = 31510; // Within 0.2% of fastMA
      
      const ctx = {
        perception,
        ind: indCache,
        cfg: mockConfig
      };
      
      const result = strategy.onCandle(mockCandle, ctx);
      
      expect(result).not.toBeNull();
      expect(result?.side).toBe('buy');
      expect(result?.reason).toBe('Trend MA pull‑back');
    });
    
    test('should not generate signal when price is too far from fast MA', () => {
      const strategy = new TrendFollowMA('bitcoin');
      
      // Manually set MAs to simulate an uptrend
      indCache.fastMA = 31500;
      indCache.slowMA = 31000;
      
      // Set current price far from fastMA (beyond 0.2%)
      mockCandle.c = 31600; // More than 0.2% from fastMA
      
      const ctx = {
        perception,
        ind: indCache,
        cfg: mockConfig
      };
      
      const result = strategy.onCandle(mockCandle, ctx);
      
      expect(result).toBeNull();
    });
  });
  
  describe('RangeBounce Strategy', () => {
    test('should generate buy signal at support with low volatility and oversold RSI', () => {
      const strategy = new RangeBounce('bitcoin');
      
      // Manually override RSI to oversold condition
      indCache.rsi14 = 28;
      
      // Set the lowest candle in perception
      const lowCandle = perception.last(10)[0];
      lowCandle.l = 31400;
      
      // Set current price near the low (support)
      mockCandle.c = 31420; // Within 2% of low
      
      const ctx = {
        perception,
        ind: indCache,
        cfg: mockConfig
      };
      
      const result = strategy.onCandle(mockCandle, ctx);
      
      expect(result).not.toBeNull();
      expect(result?.side).toBe('buy');
      expect(result?.reason).toBe('Range bounce long');
    });
    
    test('should not generate signal when RSI is not oversold', () => {
      const strategy = new RangeBounce('bitcoin');
      
      // Set RSI to neutral
      indCache.rsi14 = 50;
      
      const ctx = {
        perception,
        ind: indCache,
        cfg: mockConfig
      };
      
      const result = strategy.onCandle(mockCandle, ctx);
      
      expect(result).toBeNull();
    });
  });
  
  describe('Strategy Toggle', () => {
    test('should respect config toggle settings', () => {
      // Test case will need to be implemented after AssetAgent integration
      // This would test that strategies are only initialized when toggled on
      expect(true).toBe(true);
    });
  });
}); 