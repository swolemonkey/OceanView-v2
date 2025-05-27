/**
 * Evolution System Tests
 * 
 * Tests for mutation and scoring functions
 */

import { mutate, score } from '../src/evolution/parameterManager';

describe('Parameter Manager', () => {
  describe('mutate', () => {
    it('should mutate numeric parameters within ±10%', () => {
      // Test parameters
      const params = {
        smcThresh: 0.002,
        rsiOS: 35,
        rsiOB: 65,
        smcMinRetrace: 0.5,
        symbols: 'bitcoin', // Non-numeric field
      };
      
      // Run multiple tests to account for randomness
      for (let i = 0; i < 100; i++) {
        const result = mutate(params);
        
        // Check each numeric parameter
        expect(result.smcThresh).toBeGreaterThanOrEqual(params.smcThresh * 0.9);
        expect(result.smcThresh).toBeLessThanOrEqual(params.smcThresh * 1.1);
        
        expect(result.rsiOS).toBeGreaterThanOrEqual(params.rsiOS * 0.9);
        expect(result.rsiOS).toBeLessThanOrEqual(params.rsiOS * 1.1);
        
        expect(result.rsiOB).toBeGreaterThanOrEqual(params.rsiOB * 0.9);
        expect(result.rsiOB).toBeLessThanOrEqual(params.rsiOB * 1.1);
        
        expect(result.smcMinRetrace).toBeGreaterThanOrEqual(params.smcMinRetrace * 0.9);
        expect(result.smcMinRetrace).toBeLessThanOrEqual(params.smcMinRetrace * 1.1);
        
        // Non-numeric fields should remain unchanged
        expect(result.symbols).toBe(params.symbols);
      }
    });
    
    it('should not modify the original parameters', () => {
      const params = { value: 100 };
      const result = mutate(params);
      
      // Ensure the result is a different object
      expect(result).not.toBe(params);
      
      // Modify the result
      result.value = 200;
      
      // Original should be unchanged
      expect(params.value).toBe(100);
    });
  });
  
  describe('score', () => {
    it('should calculate sharpe ratio correctly', () => {
      // Simple test case with consistent returns
      const trades = [
        { pnl: 10 },
        { pnl: 10 },
        { pnl: 10 },
        { pnl: 10 },
      ];
      
      const result = score(trades);
      
      // For consistent returns, sharpe should be high due to low volatility
      expect(result.sharpe).toBeGreaterThan(900);
      expect(result.drawdown).toBe(0); // No drawdown with all positive returns
    });
    
    it('should calculate drawdown correctly', () => {
      // Test case with drawdown
      const trades = [
        { pnl: 10 },
        { pnl: -30 }, // Creates a drawdown
        { pnl: 10 },
        { pnl: 20 },
      ];
      
      const result = score(trades);
      
      // After the trades, the equity curve is [10, -20, -10, 10]
      // Maximum equity was 10, minimum after that was -20
      // So drawdown should be 30
      expect(result.drawdown).toBe(30);
    });
    
    it('should handle empty trade array', () => {
      const result = score([]);
      
      // With no trades, we should get default values
      expect(result.sharpe).toBe(0);  // No returns, so sharpe is 0
      expect(result.drawdown).toBe(0); // No drawdown with no trades
    });
  });
}); 