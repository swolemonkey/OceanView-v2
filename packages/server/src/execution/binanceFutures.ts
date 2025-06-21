import { ExecutionEngine, Order, Fill } from './interface.js';
import * as pino from 'pino';

// Initialize logger
const logger = pino.pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

export class BinanceFuturesEngine implements ExecutionEngine {
  supportsOCO = true;

  /**
   * Validate and normalize symbol format for Binance Futures
   * Binance Futures uses symbols like BTCUSDT, ETHUSDT, etc.
   */
  private validateAndNormalizeSymbol(symbol: string): { isValid: boolean; normalizedSymbol: string; error?: string } {
    if (!symbol || typeof symbol !== 'string') {
      return { isValid: false, normalizedSymbol: symbol, error: 'Symbol must be a non-empty string' };
    }

    // Clean up the symbol
    const cleanSymbol = symbol.toUpperCase().trim();
    
    // Check for empty symbol
    if (!cleanSymbol) {
      return { isValid: false, normalizedSymbol: symbol, error: 'Symbol cannot be empty' };
    }

    // Check for invalid characters
    if (!/^[A-Z0-9]+$/.test(cleanSymbol)) {
      return { isValid: false, normalizedSymbol: symbol, error: 'Symbol contains invalid characters' };
    }

    // Handle crypto symbols from other exchanges (convert to Binance format)
    if (cleanSymbol.startsWith('X_') && cleanSymbol.endsWith('USD')) {
      // Convert X_BTCUSD to BTCUSDT format
      const cryptoBase = cleanSymbol.substring(2, cleanSymbol.length - 3);
      const normalizedSymbol = `${cryptoBase}USDT`;
      
      logger.info(`🔄 SYMBOL CONVERSION: ${symbol} -> ${normalizedSymbol}`, {
        original: symbol,
        normalized: normalizedSymbol,
        exchange: 'binance_futures'
      });
      
      return { isValid: true, normalizedSymbol };
    }

    // Handle standard stock symbols (convert to crypto equivalent if possible)
    if (/^[A-Z]{2,5}$/.test(cleanSymbol)) {
      // Try to map common stock symbols to crypto (this is speculative)
      const cryptoEquivalent = `${cleanSymbol}USDT`;
      
      logger.warn(`⚠️ SYMBOL WARNING: Converting stock symbol to crypto format: ${cleanSymbol} -> ${cryptoEquivalent}`, {
        original: symbol,
        normalized: cryptoEquivalent,
        exchange: 'binance_futures'
      });
      
      return { isValid: true, normalizedSymbol: cryptoEquivalent };
    }

    // Handle crypto symbols already in correct format
    if (/^[A-Z]+USDT?$/.test(cleanSymbol)) {
      // Ensure it ends with USDT, not USDT
      const normalizedSymbol = cleanSymbol.endsWith('USDT') ? cleanSymbol : cleanSymbol.replace(/USDT?$/, 'USDT');
      return { isValid: true, normalizedSymbol };
    }

    // Handle other formats (add validation as needed)
    if (cleanSymbol.length > 20) {
      return { isValid: false, normalizedSymbol: symbol, error: 'Symbol too long (max 20 characters)' };
    }

    // Default to accepting the symbol but log a warning
    logger.warn(`⚠️ SYMBOL WARNING: Unrecognized symbol format: ${cleanSymbol}`, {
      symbol: cleanSymbol,
      exchange: 'binance_futures'
    });
    
    return { isValid: true, normalizedSymbol: cleanSymbol };
  }

  async place(order: Order): Promise<Fill> {
    // ========================================
    // 🔍 SYMBOL VALIDATION & NORMALIZATION
    // ========================================
    const symbolValidation = this.validateAndNormalizeSymbol(order.symbol);
    if (!symbolValidation.isValid) {
      const error = new Error(`Invalid symbol: ${symbolValidation.error}`);
      logger.error(`❌ SYMBOL VALIDATION FAILED: ${order.symbol}`, {
        symbol: order.symbol,
        error: symbolValidation.error,
        exchange: 'binance_futures'
      });
      throw error;
    }

    const normalizedSymbol = symbolValidation.normalizedSymbol;
    logger.info(`Placing ${order.side} order for ${order.qty} ${normalizedSymbol} @ $${order.price}`, {
      originalSymbol: order.symbol,
      normalizedSymbol: normalizedSymbol,
      symbolConverted: order.symbol !== normalizedSymbol,
      exchange: 'binance_futures'
    });

    // TODO: Implement actual Binance Futures API integration
    // For now, return simulated fill with normalized symbol
    return {
      id: `fut-${Date.now()}`,
      symbol: normalizedSymbol, // Use normalized symbol
      side: order.side,
      qty: order.qty,
      price: order.price,
      fee: order.qty * order.price * 0.0004, // Binance futures fee estimate
      timestamp: Date.now()
    };
  }
}
