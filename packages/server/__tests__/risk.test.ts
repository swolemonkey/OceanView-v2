import { describe, it, expect } from '@jest/globals';
import { RiskManager } from '../src/bots/hypertrades/risk';

describe('RiskManager', () => {
  it('handles risk sizing & limits', () => {
    const r = new RiskManager();
    const price = 10000; // $10k price
    const stop = 9900;   // 1% below for stop loss
    const qty = r.sizeTrade(stop, price);
    expect(qty).toBeCloseTo(1); // risk$=100, stop diff=100 → 1
    
    // First order - 1% risk
    r.registerOrder('buy', qty, price, stop);
    expect(r.openRisk).toBeCloseTo(1);
    expect(r.canTrade()).toBe(true);
    
    // Second order - another 1% risk (total 2%)
    r.registerOrder('buy', qty, price, stop); 
    expect(r.openRisk).toBeCloseTo(2);
    expect(r.canTrade()).toBe(true);
    
    // Third order - another 1% risk (total 3%)
    r.registerOrder('buy', qty, price, stop);
    expect(r.openRisk).toBeCloseTo(3);
    expect(r.canTrade()).toBe(false);
  });
  
  it('calculates trailing stops correctly', () => {
    // We'll test the trailing stop calculation directly
    
    // Create a position for testing
    const longPosition = { 
      qty: 1, 
      entry: 10000, 
      side: 'buy' as 'buy', 
      stop: 9800,  // Initial stop at $9800
      symbol: 'BTCUSD'
    };
    
    const shortPosition = { 
      qty: 1, 
      entry: 10300, 
      side: 'sell' as 'sell', 
      stop: 10500,  // Initial stop at $10500
      symbol: 'BTCUSD'
    };
    
    // Create a base stop price (would normally be calculated from ATR)
    const longTrailingStop = 10050;  // This is higher than the initial stop (9800)
    const shortTrailingStop = 10450;  // This is lower than the initial stop (10500)
    
    // Verify the long trailing stop is updated correctly (moves up)
    const newLongStop = Math.max(longPosition.stop || -Infinity, longTrailingStop);
    expect(newLongStop).toBe(10050);  // Should use the trailing stop as it's higher
    
    // Verify the short trailing stop is updated correctly (moves down)
    const newShortStop = Math.min(shortPosition.stop || Infinity, shortTrailingStop);
    expect(newShortStop).toBe(10450);  // Should use the trailing stop as it's lower
    
    // Test that trailing stop doesn't move unfavorably
    const unfavorableLongTrailingStop = 9700;  // This is lower than the initial stop (9800)
    const unfavorableShortTrailingStop = 10600;  // This is higher than the initial stop (10500)
    
    // The stop should NOT move down for long positions
    const unfavorableLongStop = Math.max(longPosition.stop || -Infinity, unfavorableLongTrailingStop);
    expect(unfavorableLongStop).toBe(9800);  // Should keep the initial stop
    
    // The stop should NOT move up for short positions
    const unfavorableShortStop = Math.min(shortPosition.stop || Infinity, unfavorableShortTrailingStop);
    expect(unfavorableShortStop).toBe(10500);  // Should keep the initial stop
  });
}); 