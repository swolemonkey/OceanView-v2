import { describe, it, expect } from '@jest/globals';
import { RiskManager } from '../src/bots/hypertrades/risk.js';

describe('RiskManager', () => {
  it('handles risk sizing & limits', () => {
    const r = new RiskManager();
    const qty = r.sizeTrade(10000); // $10k price
    expect(qty).toBeCloseTo(1); // risk$=100, stop=100 → 1
    
    // First order - 1% risk
    r.registerOrder('buy', qty, 10000);
    expect(r.openRisk).toBeCloseTo(1);
    expect(r.canTrade()).toBe(true);
    
    // Second order - another 1% risk (total 2%)
    r.registerOrder('buy', qty, 10000); 
    expect(r.openRisk).toBeCloseTo(2);
    expect(r.canTrade()).toBe(true);
    
    // Third order - another 1% risk (total 3%)
    r.registerOrder('buy', qty, 10000);
    expect(r.openRisk).toBeCloseTo(3);
    expect(r.canTrade()).toBe(false);
  });
}); 