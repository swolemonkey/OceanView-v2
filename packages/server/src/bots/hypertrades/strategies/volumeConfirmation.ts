import type { Candle } from '../perception.js';

export interface VolumeProfile {
  averageVolume: number;
  recentVolumeRatio: number;
  volumeTrend: 'increasing' | 'decreasing' | 'stable';
  volumeSpike: boolean;
  confirmation: 'strong' | 'moderate' | 'weak' | 'none';
  confidence: number;
}

export class VolumeConfirmationManager {
  private volumeHistory: number[] = [];
  private readonly maxHistory = 20;

  /**
   * Analyze volume patterns to confirm signal quality
   */
  analyzeVolume(candles: Candle[]): VolumeProfile {
    if (candles.length < 10) {
      return {
        averageVolume: 0,
        recentVolumeRatio: 1,
        volumeTrend: 'stable',
        volumeSpike: false,
        confirmation: 'none',
        confidence: 0
      };
    }

    // Extract volume data (use real volume if available, otherwise proxy)
    const volumes = candles.slice(-this.maxHistory).map(c => {
      // Use real volume if available, otherwise proxy with close price
      return (c as any).v !== undefined ? (c as any).v : c.c * 1000;
    });
    const currentVolume = volumes[volumes.length - 1];
    const averageVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
    
    // Calculate recent volume ratio
    const recentVolumeRatio = currentVolume / averageVolume;
    
    // Determine volume trend
    const volumeTrend = this.calculateVolumeTrend(volumes);
    
    // Detect volume spikes
    const volumeSpike = recentVolumeRatio > 1.5; // 50% above average
    
    // Determine confirmation level
    const confirmation = this.getConfirmationLevel(recentVolumeRatio, volumeTrend, volumeSpike);
    
    // Calculate confidence score
    const confidence = this.calculateConfidence(recentVolumeRatio, volumeTrend, volumeSpike);

    return {
      averageVolume,
      recentVolumeRatio,
      volumeTrend,
      volumeSpike,
      confirmation,
      confidence
    };
  }

  private calculateVolumeTrend(volumes: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (volumes.length < 5) return 'stable';
    
    const recent = volumes.slice(-5);
    const earlier = volumes.slice(-10, -5);
    
    const recentAvg = recent.reduce((sum, vol) => sum + vol, 0) / recent.length;
    const earlierAvg = earlier.reduce((sum, vol) => sum + vol, 0) / earlier.length;
    
    const change = (recentAvg - earlierAvg) / earlierAvg;
    
    if (change > 0.1) return 'increasing';
    if (change < -0.1) return 'decreasing';
    return 'stable';
  }

  private getConfirmationLevel(
    ratio: number, 
    trend: 'increasing' | 'decreasing' | 'stable', 
    spike: boolean
  ): 'strong' | 'moderate' | 'weak' | 'none' {
    // Strong confirmation: High volume + increasing trend + spike
    if (ratio > 1.4 && trend === 'increasing' && spike) {
      return 'strong';
    }
    
    // Moderate confirmation: Above average volume + positive trend
    if (ratio > 1.2 && (trend === 'increasing' || spike)) {
      return 'moderate';
    }
    
    // Weak confirmation: Slightly above average volume
    if (ratio > 1.0 && ratio <= 1.2) {
      return 'weak';
    }
    
    // No confirmation: Below average volume
    return 'none';
  }

  private calculateConfidence(
    ratio: number, 
    trend: 'increasing' | 'decreasing' | 'stable', 
    spike: boolean
  ): number {
    let confidence = 0;
    
    // Base confidence from volume ratio
    if (ratio > 2.0) confidence += 0.4;
    else if (ratio > 1.5) confidence += 0.3;
    else if (ratio > 1.2) confidence += 0.2;
    else if (ratio > 1.0) confidence += 0.1;
    
    // Trend bonus
    if (trend === 'increasing') confidence += 0.2;
    else if (trend === 'stable') confidence += 0.1;
    
    // Spike bonus
    if (spike) confidence += 0.15;
    
    // Volume consistency bonus (if we have enough history)
    if (ratio > 1.0 && ratio < 3.0) confidence += 0.1; // Reasonable volume
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Filter signals based on volume confirmation
   */
  shouldFilterSignal(volumeProfile: VolumeProfile, signalType: 'buy' | 'sell'): boolean {
    // Only filter signals with 'none' confirmation - allow 'weak' through
    if (volumeProfile.confirmation === 'none') {
      return true; // Filter out only 'none'
    }
    
    // Filter out signals with extremely low volume (more lenient)
    if (volumeProfile.recentVolumeRatio < 0.5) {
      return true; // Filter out only very low volume
    }
    
    // Allow more signals through - removed the 1.1 threshold
    return false; // Don't filter most signals
  }

  /**
   * Adjust signal confidence based on volume
   */
  adjustSignalConfidence(baseConfidence: number, volumeProfile: VolumeProfile): number {
    let multiplier = 1.0;
    
    switch (volumeProfile.confirmation) {
      case 'strong':
        multiplier = 1.3;
        break;
      case 'moderate':
        multiplier = 1.15;
        break;
      case 'weak':
        multiplier = 1.0;
        break;
      case 'none':
        multiplier = 0.8;
        break;
    }
    
    // Additional adjustment based on volume spike
    if (volumeProfile.volumeSpike) {
      multiplier *= 1.1;
    }
    
    return Math.min(baseConfidence * multiplier, 0.95);
  }
} 