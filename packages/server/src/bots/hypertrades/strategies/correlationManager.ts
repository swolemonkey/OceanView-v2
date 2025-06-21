export interface CorrelationData {
  symbol1: string;
  symbol2: string;
  correlation: number;
  confidence: number;
  lastUpdated: number;
}

export interface PositionCorrelationAnalysis {
  wouldExceedCorrelationLimit: boolean;
  maxCorrelation: number;
  correlatedSymbols: string[];
  recommendedSizeReduction: number; // 0-1 multiplier
  reason: string;
}

export class CorrelationManager {
  private correlationMatrix: Map<string, Map<string, CorrelationData>> = new Map();
  private readonly maxCorrelation = 0.7; // Max allowed correlation between positions
  private readonly highCorrelationThreshold = 0.5;

  /**
   * Pre-defined correlation relationships for common assets
   */
  private static readonly KNOWN_CORRELATIONS: Record<string, Record<string, number>> = {
    // Tech stocks typically correlated
    'AAPL': { 'MSFT': 0.65, 'GOOGL': 0.60, 'META': 0.55, 'NVDA': 0.70, 'TSLA': 0.45 },
    'MSFT': { 'AAPL': 0.65, 'GOOGL': 0.70, 'META': 0.60, 'NVDA': 0.65, 'AMZN': 0.60 },
    'GOOGL': { 'AAPL': 0.60, 'MSFT': 0.70, 'META': 0.75, 'NVDA': 0.60, 'AMZN': 0.65 },
    'META': { 'AAPL': 0.55, 'MSFT': 0.60, 'GOOGL': 0.75, 'NVDA': 0.50, 'AMZN': 0.55 },
    'NVDA': { 'AAPL': 0.70, 'MSFT': 0.65, 'GOOGL': 0.60, 'META': 0.50, 'TSLA': 0.55, 'AMD': 0.80 },
    'TSLA': { 'AAPL': 0.45, 'NVDA': 0.55, 'AMD': 0.40, 'COIN': 0.35 },
    'AMD': { 'NVDA': 0.80, 'TSLA': 0.40, 'AAPL': 0.50, 'MSFT': 0.45 },
    'AMZN': { 'MSFT': 0.60, 'GOOGL': 0.65, 'META': 0.55, 'AAPL': 0.55 },
    
    // Crypto correlations
    'X:BTCUSD': { 'X:ETHUSD': 0.85, 'X:SOLUSD': 0.75, 'COIN': 0.70 },
    'X:ETHUSD': { 'X:BTCUSD': 0.85, 'X:SOLUSD': 0.80, 'COIN': 0.65 },
    'X:SOLUSD': { 'X:BTCUSD': 0.75, 'X:ETHUSD': 0.80, 'COIN': 0.60 },
    'COIN': { 'X:BTCUSD': 0.70, 'X:ETHUSD': 0.65, 'X:SOLUSD': 0.60, 'TSLA': 0.35 }
  };

  /**
   * Get correlation between two symbols
   */
  getCorrelation(symbol1: string, symbol2: string): number {
    if (symbol1 === symbol2) return 1.0;
    
    // Check known correlations first
    const known1 = CorrelationManager.KNOWN_CORRELATIONS[symbol1]?.[symbol2];
    if (known1 !== undefined) return known1;
    
    const known2 = CorrelationManager.KNOWN_CORRELATIONS[symbol2]?.[symbol1];
    if (known2 !== undefined) return known2;
    
    // Check computed correlations
    const correlation1 = this.correlationMatrix.get(symbol1)?.get(symbol2);
    if (correlation1) return correlation1.correlation;
    
    const correlation2 = this.correlationMatrix.get(symbol2)?.get(symbol1);
    if (correlation2) return correlation2.correlation;
    
    // Default to low correlation if unknown
    return 0.1;
  }

  /**
   * Analyze correlation impact of adding a new position
   */
  analyzePositionCorrelation(
    newSymbol: string,
    existingPositions: Map<string, any>
  ): PositionCorrelationAnalysis {
    // If there are no open positions, correlation is not a concern
    if (existingPositions.size === 0) {
      return {
        wouldExceedCorrelationLimit: false,
        maxCorrelation: 0,
        correlatedSymbols: [],
        recommendedSizeReduction: 1.0,
        reason: 'No existing positions'
      };
    }

    const correlatedSymbols: string[] = [];
    let maxCorrelation = 0;
    let totalCorrelationScore = 0;
    
    for (const [existingSymbol] of existingPositions) {
      const correlation = Math.abs(this.getCorrelation(newSymbol, existingSymbol));
      
      // Ignore self-correlation (same symbol)
      if (newSymbol === existingSymbol) {
        continue;
      }
      
      if (correlation > this.highCorrelationThreshold) {
        correlatedSymbols.push(existingSymbol);
      }
      
      maxCorrelation = Math.max(maxCorrelation, correlation);
      totalCorrelationScore += correlation;
    }
    
    const wouldExceedLimit = maxCorrelation > this.maxCorrelation;
    
    // Calculate recommended size reduction based on correlation
    let sizeReduction = 1.0;
    if (maxCorrelation > this.highCorrelationThreshold) {
      // Reduce size proportionally to correlation level
      sizeReduction = Math.max(0.3, 1.0 - ((maxCorrelation - this.highCorrelationThreshold) / (this.maxCorrelation - this.highCorrelationThreshold)) * 0.7);
    }
    
    let reason = 'No significant correlation concerns';
    if (wouldExceedLimit) {
      reason = `High correlation (${(maxCorrelation * 100).toFixed(1)}%) with ${correlatedSymbols.join(', ')}`;
    } else if (correlatedSymbols.length > 0) {
      reason = `Moderate correlation with ${correlatedSymbols.length} position(s): ${correlatedSymbols.join(', ')}`;
    }
    
    return {
      wouldExceedCorrelationLimit: wouldExceedLimit,
      maxCorrelation,
      correlatedSymbols,
      recommendedSizeReduction: sizeReduction,
      reason
    };
  }

  /**
   * Get portfolio diversification score (0-1, higher is better)
   */
  getPortfolioDiversificationScore(positions: Map<string, any>): number {
    if (positions.size <= 1) return 1.0;
    
    const symbols = Array.from(positions.keys());
    let totalCorrelation = 0;
    let pairCount = 0;
    
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        totalCorrelation += Math.abs(this.getCorrelation(symbols[i], symbols[j]));
        pairCount++;
      }
    }
    
    const avgCorrelation = pairCount > 0 ? totalCorrelation / pairCount : 0;
    
    // Convert to diversification score (inverse of correlation)
    return Math.max(0, 1.0 - avgCorrelation);
  }

  /**
   * Update correlation data dynamically (for future implementation)
   */
  updateCorrelation(symbol1: string, symbol2: string, correlation: number, confidence: number = 1.0): void {
    if (!this.correlationMatrix.has(symbol1)) {
      this.correlationMatrix.set(symbol1, new Map());
    }
    
    this.correlationMatrix.get(symbol1)!.set(symbol2, {
      symbol1,
      symbol2,
      correlation,
      confidence,
      lastUpdated: Date.now()
    });
  }
} 