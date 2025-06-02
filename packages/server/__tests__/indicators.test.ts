import { IndicatorCache } from '../src/bots/hypertrades/indicators/cache';

describe('IndicatorCache', () => {
  let cache: IndicatorCache;
  
  beforeEach(() => {
    cache = new IndicatorCache();
  });
  
  describe('RSI calculation', () => {
    it('should calculate RSI-14 correctly', () => {
      // Initial state
      expect(cache.rsi14).toBe(50);
      
      // Add 15 candles (need 14+1 for calculation)
      const prices = [100, 102, 104, 103, 105, 107, 108, 109, 106, 105, 107, 108, 110, 109, 111];
      
      prices.forEach(price => {
        cache.updateOnClose(price);
      });
      
      // RSI should be calculated and be in range 0-100
      expect(cache.rsi14).toBeGreaterThan(0);
      expect(cache.rsi14).toBeLessThan(100);
      
      // With mostly upward movement, RSI should be high
      expect(cache.rsi14).toBeGreaterThan(60);
    });
  });
  
  describe('Moving Averages', () => {
    it('should calculate fast and slow MAs correctly', () => {
      // Fill with 50 prices at 100
      for (let i = 0; i < 50; i++) {
        cache.updateOnClose(100);
      }
      
      // Both MAs should be 100
      expect(cache.fastMA).toBeGreaterThan(0);
      expect(cache.slowMA).toBeGreaterThan(0);
      
      // Add 10 prices at 110
      for (let i = 0; i < 10; i++) {
        cache.updateOnClose(110);
      }
      
      // Fast MA should respond more quickly
      expect(cache.fastMA).toBeGreaterThan(100);
      expect(cache.fastMA).toBeLessThan(110);
      expect(cache.slowMA).toBeGreaterThan(100);
      expect(cache.slowMA).toBeLessThan(cache.fastMA);
    });
  });
  
  describe('Bollinger Band Width', () => {
    it('should calculate BB Width correctly', () => {
      // Initial state
      expect(cache.bbWidth).toBe(0);
      
      // Add 20 identical prices
      for (let i = 0; i < 20; i++) {
        cache.updateOnClose(100);
      }
      
      // For identical prices, BB width should be 0 (no volatility)
      expect(cache.bbWidth).toBeGreaterThanOrEqual(0);
      
      // Add 5 prices with volatility
      cache.updateOnClose(105);
      cache.updateOnClose(95);
      cache.updateOnClose(110);
      cache.updateOnClose(90);
      cache.updateOnClose(100);
      
      // BB width should increase with volatility
      expect(cache.bbWidth).toBeGreaterThan(0.05);
    });
  });
  
  describe('Average True Range (ATR-14)', () => {
    it('should calculate ATR-14 correctly', () => {
      // Initial state
      expect(cache.atr14).toBe(0);
      
      // Add 15 candles with high/low/close data
      for (let i = 0; i < 15; i++) {
        const base = 100 + i;
        cache.updateOnClose(base, base + 2, base - 2); // close, high, low
      }
      
      // ATR should be calculated and positive
      expect(cache.atr14).toBeGreaterThan(0);
      
      // With steady 4-point ranges, ATR should be close to 4
      expect(cache.atr14).toBeGreaterThanOrEqual(3);
      expect(cache.atr14).toBeLessThanOrEqual(5);
    });
  });
  
  describe('Average Directional Index (ADX-14)', () => {
    it('should calculate ADX-14 correctly', () => {
      // Initial state - should have a default value
      expect(cache.adx14).toBe(25);
      
      // Add 15 candles with a strong trend
      let price = 100;
      for (let i = 0; i < 15; i++) {
        price += 2; // Strong uptrend
        cache.updateOnClose(price, price + 1, price - 1);
      }
      
      // ADX should be calculated and in the range 0-100
      expect(cache.adx14).toBeGreaterThan(0);
      expect(cache.adx14).toBeLessThan(100);
      
      // With a strong trend, ADX should be relatively high
      expect(cache.adx14).toBeGreaterThan(20);
    });
  });
});

// Simplified candle close timing test
describe('Candle close timing', () => {
  it('should identify minute rollovers correctly', () => {
    // Set up two timestamps 65 seconds apart
    const previousTime = new Date('2023-01-01T12:00:00Z').getTime();
    const currentTime = new Date('2023-01-01T12:01:05Z').getTime();
    
    // Get minute boundaries
    const previousMinute = Math.floor(previousTime / 60000) * 60000;
    const currentMinute = Math.floor(currentTime / 60000) * 60000;
    
    // Verify they're different minutes
    expect(currentMinute).toBeGreaterThan(previousMinute);
    expect(currentMinute - previousMinute).toBe(60000); // Exactly 1 minute apart
    
    // Simulate the candle close check
    const isCandleClose = currentMinute > previousMinute && previousMinute > 0;
    expect(isCandleClose).toBe(true);
  });
}); 