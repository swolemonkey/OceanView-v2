import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const fetchFn = async (url: string, init?: RequestInit) => {
  const mod = await import('node-fetch');
  return (mod.default as any)(url, init);
};

export type PolygonCandle = {
  ts: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
};

interface CachedData {
  data: PolygonCandle[];
  timestamp: number;
  symbol: string;
  startDate: string;
  endDate: string;
}

class RateLimiter {
  private calls: number[] = [];
  private readonly maxCalls: number;
  private readonly windowMs: number;

  constructor(maxCalls: number = 5, windowMinutes: number = 1) {
    this.maxCalls = maxCalls;
    this.windowMs = windowMinutes * 60 * 1000; // Convert to milliseconds
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    
    // Remove calls outside the window
    this.calls = this.calls.filter(callTime => now - callTime < this.windowMs);
    
    if (this.calls.length >= this.maxCalls) {
      // Need to wait until the oldest call is outside the window
      const oldestCall = Math.min(...this.calls);
      const waitTime = this.windowMs - (now - oldestCall) + 100; // Add 100ms buffer
      
      console.log(`🚦 RATE LIMIT: Waiting ${Math.ceil(waitTime / 1000)}s before next Polygon API call (${this.calls.length}/${this.maxCalls} calls used)`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Clean up again after waiting
      const newNow = Date.now();
      this.calls = this.calls.filter(callTime => newNow - callTime < this.windowMs);
    }
    
    // Record this call
    this.calls.push(now);
  }

  getStatus(): { callsUsed: number; maxCalls: number; resetIn: number } {
    const now = Date.now();
    this.calls = this.calls.filter(callTime => now - callTime < this.windowMs);
    
    const resetIn = this.calls.length > 0 
      ? Math.max(0, this.windowMs - (now - Math.min(...this.calls)))
      : 0;
    
    return {
      callsUsed: this.calls.length,
      maxCalls: this.maxCalls,
      resetIn: Math.ceil(resetIn / 1000)
    };
  }
}

export class PolygonDataFeed {
  private static rateLimiter = new RateLimiter(5, 1); // 5 calls per minute
  private static cacheDir = path.join(process.cwd(), 'packages/server/data/polygon_cache');
  
  constructor(private symbol: string) {
    this.ensureCacheDir();
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(PolygonDataFeed.cacheDir)) {
      fs.mkdirSync(PolygonDataFeed.cacheDir, { recursive: true });
      console.log(`📁 Created Polygon cache directory: ${PolygonDataFeed.cacheDir}`);
    }
  }

  private getCacheKey(symbol: string, startISO: string, endISO: string): string {
    const content = `${symbol}-${startISO}-${endISO}`;
    return crypto.createHash('md5').update(content).digest('hex');
  }

  private getCachePath(cacheKey: string): string {
    return path.join(PolygonDataFeed.cacheDir, `${cacheKey}.json`);
  }

  private async loadFromCache(symbol: string, startISO: string, endISO: string): Promise<PolygonCandle[] | null> {
    try {
      const cacheKey = this.getCacheKey(symbol, startISO, endISO);
      const cachePath = this.getCachePath(cacheKey);
      
      if (!fs.existsSync(cachePath)) {
        return null;
      }

      const cached: CachedData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      
      // Check if cache is still valid (24 hours)
      const cacheAge = Date.now() - cached.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      if (cacheAge > maxAge) {
        console.log(`🗑️ CACHE EXPIRED: Removing stale cache for ${symbol} (${Math.ceil(cacheAge / (60 * 60 * 1000))}h old)`);
        fs.unlinkSync(cachePath);
        return null;
      }

      console.log(`💾 CACHE HIT: Loaded ${cached.data.length} candles for ${symbol} from cache (${Math.ceil(cacheAge / (60 * 1000))}m old)`);
      return cached.data;
    } catch (error) {
      console.warn(`⚠️ CACHE ERROR: Failed to load cache for ${symbol}:`, error);
      return null;
    }
  }

  private async saveToCache(symbol: string, startISO: string, endISO: string, data: PolygonCandle[]): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(symbol, startISO, endISO);
      const cachePath = this.getCachePath(cacheKey);
      
      const cacheData: CachedData = {
        data,
        timestamp: Date.now(),
        symbol,
        startDate: startISO,
        endDate: endISO
      };

      fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
      console.log(`💾 CACHE SAVE: Stored ${data.length} candles for ${symbol} in cache`);
    } catch (error) {
      console.warn(`⚠️ CACHE ERROR: Failed to save cache for ${symbol}:`, error);
    }
  }

  async *iterate(startISO: string, endISO: string): AsyncGenerator<PolygonCandle> {
    // Try to load from cache first
    const cachedData = await this.loadFromCache(this.symbol, startISO, endISO);
    
    if (cachedData) {
      console.log(`🚀 CACHE: Using cached data for ${this.symbol} (${cachedData.length} candles)`);
      for (const candle of cachedData) {
        yield candle;
      }
      return;
    }

    // Rate limit before API call
    const rateLimitStatus = PolygonDataFeed.rateLimiter.getStatus();
    console.log(`🚦 RATE LIMIT STATUS: ${rateLimitStatus.callsUsed}/${rateLimitStatus.maxCalls} calls used, reset in ${rateLimitStatus.resetIn}s`);
    
    await PolygonDataFeed.rateLimiter.waitIfNeeded();

    // Fetch from API
    const key = process.env.POLYGON_API_KEY!;
    const url = `https://api.polygon.io/v2/aggs/ticker/${this.symbol}/range/5/minute/${startISO}/${endISO}?adjusted=true&sort=asc&limit=50000&apiKey=${key}`;
    
    console.log(`🌐 API CALL: Fetching data for ${this.symbol} from ${startISO} to ${endISO}`);
    
    try {
      const res = await fetchFn(url);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`❌ API ERROR: ${res.status} ${res.statusText}`, errorText);
        throw new Error(errorText);
      }

      const responseData = await res.json();
      
      if (responseData.status === 'ERROR') {
        console.error(`❌ POLYGON ERROR:`, responseData);
        throw new Error(JSON.stringify(responseData));
      }

      const { results } = responseData;
      
      if (!results || results.length === 0) {
        console.warn(`⚠️ NO DATA: No results returned for ${this.symbol} from ${startISO} to ${endISO}`);
        return;
      }

      console.log(`✅ API SUCCESS: Received ${results.length} data points for ${this.symbol}`);
      console.log(`📊 DATA RANGE: ${new Date(results[0].t).toISOString()} to ${new Date(results[results.length-1].t).toISOString()}`);

      // Convert to our format
      const candles: PolygonCandle[] = results.map((r: any) => ({
        ts: r.t,
        o: r.o,
        h: r.h,
        l: r.l,
        c: r.c,
        v: r.v || 0
      }));

      // Save to cache for future use
      await this.saveToCache(this.symbol, startISO, endISO, candles);

      // Yield the data
      for (const candle of candles) {
        yield candle;
      }

    } catch (error) {
      console.error(`❌ FETCH ERROR for ${this.symbol}:`, error);
      throw error;
    }
  }

  // Enhanced static method to get comprehensive cache statistics
  static getCacheStats(): { 
    totalFiles: number; 
    totalSize: number; 
    totalSizeMB: number;
    oldestFile: string | null; 
    oldestAge: number;
    newestFile: string | null;
    newestAge: number;
    averageFileSize: number;
  } {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        return { 
          totalFiles: 0, 
          totalSize: 0, 
          totalSizeMB: 0,
          oldestFile: null, 
          oldestAge: 0,
          newestFile: null,
          newestAge: 0,
          averageFileSize: 0
        };
      }

      const files = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.json'));
      if (files.length === 0) {
        return { 
          totalFiles: 0, 
          totalSize: 0, 
          totalSizeMB: 0,
          oldestFile: null, 
          oldestAge: 0,
          newestFile: null,
          newestAge: 0,
          averageFileSize: 0
        };
      }

      let totalSize = 0;
      let oldestTime = Date.now();
      let newestTime = 0;
      let oldestFile: string | null = null;
      let newestFile: string | null = null;

      for (const file of files) {
        const filePath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        
        if (stats.mtime.getTime() < oldestTime) {
          oldestTime = stats.mtime.getTime();
          oldestFile = file;
        }
        
        if (stats.mtime.getTime() > newestTime) {
          newestTime = stats.mtime.getTime();
          newestFile = file;
        }
      }

      const now = Date.now();
      return {
        totalFiles: files.length,
        totalSize,
        totalSizeMB: Math.round((totalSize / (1024 * 1024)) * 100) / 100,
        oldestFile,
        oldestAge: oldestFile ? Math.ceil((now - oldestTime) / (60 * 60 * 1000)) : 0,
        newestFile,
        newestAge: newestFile ? Math.ceil((now - newestTime) / (60 * 60 * 1000)) : 0,
        averageFileSize: Math.round(totalSize / files.length)
      };
    } catch (error) {
      console.warn('❌ Error getting cache stats:', error);
      return { 
        totalFiles: 0, 
        totalSize: 0, 
        totalSizeMB: 0,
        oldestFile: null, 
        oldestAge: 0,
        newestFile: null,
        newestAge: 0,
        averageFileSize: 0
      };
    }
  }

  // Enhanced static method to clear old cache files with detailed reporting
  static clearOldCache(maxAgeHours: number = 72): { deletedCount: number; freedMB: number; errors: string[] } {
    const result = { deletedCount: 0, freedMB: 0, errors: [] as string[] };
    
    try {
      if (!fs.existsSync(this.cacheDir)) {
        console.log('📁 Cache directory does not exist, nothing to clean');
        return result;
      }

      const files = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.json'));
      if (files.length === 0) {
        console.log('📁 Cache directory is empty, nothing to clean');
        return result;
      }

      const maxAge = maxAgeHours * 60 * 60 * 1000;
      const now = Date.now();

      console.log(`🧹 CACHE CLEANUP: Checking ${files.length} cache files for cleanup (max age: ${maxAgeHours}h)`);

      for (const file of files) {
        try {
          const filePath = path.join(this.cacheDir, file);
          const stats = fs.statSync(filePath);
          const age = now - stats.mtime.getTime();
          
          if (age > maxAge) {
            const sizeMB = Math.round((stats.size / (1024 * 1024)) * 100) / 100;
            fs.unlinkSync(filePath);
            result.deletedCount++;
            result.freedMB += sizeMB;
            console.log(`🗑️ DELETED: ${file} (${Math.ceil(age / (60 * 60 * 1000))}h old, ${sizeMB}MB)`);
          }
        } catch (error) {
          const errorMsg = `Failed to delete ${file}: ${error}`;
          result.errors.push(errorMsg);
          console.warn(`⚠️ ${errorMsg}`);
        }
      }

      if (result.deletedCount > 0) {
        console.log(`✅ CLEANUP COMPLETE: Deleted ${result.deletedCount} files, freed ${Math.round(result.freedMB * 100) / 100}MB`);
      } else {
        console.log(`✅ CLEANUP COMPLETE: No files needed cleanup (all files < ${maxAgeHours}h old)`);
      }

      return result;
    } catch (error) {
      const errorMsg = `Cache cleanup failed: ${error}`;
      result.errors.push(errorMsg);
      console.warn(`❌ ${errorMsg}`);
      return result;
    }
  }

  // New method to clear all cache files
  static clearAllCache(): { deletedCount: number; freedMB: number; errors: string[] } {
    const result = { deletedCount: 0, freedMB: 0, errors: [] as string[] };
    
    try {
      if (!fs.existsSync(this.cacheDir)) {
        console.log('📁 Cache directory does not exist, nothing to clear');
        return result;
      }

      const files = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.json'));
      if (files.length === 0) {
        console.log('📁 Cache directory is empty, nothing to clear');
        return result;
      }

      console.log(`🧹 CACHE CLEAR: Deleting all ${files.length} cache files`);

      for (const file of files) {
        try {
          const filePath = path.join(this.cacheDir, file);
          const stats = fs.statSync(filePath);
          const sizeMB = Math.round((stats.size / (1024 * 1024)) * 100) / 100;
          
          fs.unlinkSync(filePath);
          result.deletedCount++;
          result.freedMB += sizeMB;
        } catch (error) {
          const errorMsg = `Failed to delete ${file}: ${error}`;
          result.errors.push(errorMsg);
          console.warn(`⚠️ ${errorMsg}`);
        }
      }

      console.log(`✅ CACHE CLEARED: Deleted ${result.deletedCount} files, freed ${Math.round(result.freedMB * 100) / 100}MB`);
      return result;
    } catch (error) {
      const errorMsg = `Cache clear failed: ${error}`;
      result.errors.push(errorMsg);
      console.warn(`❌ ${errorMsg}`);
      return result;
    }
  }

  // New method for automatic cache maintenance
  static async performMaintenance(): Promise<void> {
    console.log('🔧 CACHE MAINTENANCE: Starting automatic cache maintenance...');
    
    // Get current stats
    const statsBefore = this.getCacheStats();
    console.log(`📊 BEFORE: ${statsBefore.totalFiles} files, ${statsBefore.totalSizeMB}MB total`);
    
    // Clean up old cache (older than 48 hours by default)
    const cleanup = this.clearOldCache(48);
    
    // Get stats after cleanup
    const statsAfter = this.getCacheStats();
    console.log(`📊 AFTER: ${statsAfter.totalFiles} files, ${statsAfter.totalSizeMB}MB total`);
    
    if (cleanup.errors.length > 0) {
      console.warn(`⚠️ MAINTENANCE WARNINGS: ${cleanup.errors.length} errors occurred`);
    }
    
    console.log('✅ CACHE MAINTENANCE: Completed');
  }
}
