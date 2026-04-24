import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface FeeStats {
  sorobanInclusionFee: {
    max: string;
    min: string;
    mode: string;
    p50: string;
    p90: string;
    p95: string;
    p99: string;
  };
  latestLedger: number;
}

export interface FeeEstimate {
  baseFee: number;
  priorityFee: number;
  totalFee: number;
  cappedFee: number;
  isCapped: boolean;
}

@Injectable()
export class FeeEstimatorService {
  private readonly logger = new Logger(FeeEstimatorService.name);
  private readonly rpcServer: any;
  
  private readonly BASE_FEE = 100; // stroops
  private readonly HIGH_PRIORITY_PERCENTILE = 95; // Use p95 for oracle reveals
  private readonly MAX_FEE_CAP_STROOPS: number;
  private readonly LOW_STAKES_THRESHOLD_XLM: number;
  
  private cachedFeeStats: FeeStats | null = null;
  private lastFetchTime = 0;
  private readonly CACHE_TTL_MS = 10_000; // 10 seconds

  constructor(private readonly configService: ConfigService) {
    const rpcUrl =
      this.configService.get<string>('SOROBAN_RPC_URL') ||
      'https://soroban-testnet.stellar.org';
    
    // Use @stellar/stellar-sdk
    const StellarSdk = require('@stellar/stellar-sdk');
    this.rpcServer = new StellarSdk.rpc.Server(rpcUrl);
    
    // Fee cap: default 10 XLM = 100,000,000 stroops
    this.MAX_FEE_CAP_STROOPS = parseInt(
      this.configService.get<string>('ORACLE_MAX_FEE_STROOPS') || '100000000',
      10,
    );
    
    // Low stakes threshold: default 500 XLM
    this.LOW_STAKES_THRESHOLD_XLM = parseFloat(
      this.configService.get<string>('LOW_STAKES_THRESHOLD_XLM') || '500',
    );
    
    this.logger.log(
      `FeeEstimator initialized: max cap ${this.MAX_FEE_CAP_STROOPS} stroops, ` +
      `low stakes threshold ${this.LOW_STAKES_THRESHOLD_XLM} XLM`,
    );
  }

  /**
   * Estimates the optimal fee for oracle reveal transactions.
   * Uses high priority (p95) to ensure execution during congestion.
   * Applies cap to avoid excessive spending on low-stakes raffles.
   */
  async estimateFee(rafflePrizeXLM?: number): Promise<FeeEstimate> {
    const stats = await this.getFeeStats();
    
    if (!stats) {
      // Fallback to conservative default if stats unavailable
      this.logger.warn('Fee stats unavailable, using fallback fee');
      return this.buildFallbackEstimate();
    }
    
    const baseFee = this.BASE_FEE;
    const p95Fee = parseInt(stats.sorobanInclusionFee.p95, 10);
    const priorityFee = Math.max(p95Fee, baseFee);
    const totalFee = priorityFee;
    
    // Apply cap based on raffle stakes
    const cap = this.calculateFeeCap(rafflePrizeXLM);
    const cappedFee = Math.min(totalFee, cap);
    const isCapped = cappedFee < totalFee;
    
    if (isCapped) {
      this.logger.warn(
        `Fee capped at ${cappedFee} stroops (original: ${totalFee}, ` +
        `prize: ${rafflePrizeXLM || 'unknown'} XLM)`,
      );
    }
    
    return {
      baseFee,
      priorityFee,
      totalFee,
      cappedFee,
      isCapped,
    };
  }

  /**
   * Fetches current fee statistics from Soroban RPC.
   * Results are cached for CACHE_TTL_MS to reduce RPC load.
   */
  private async getFeeStats(): Promise<FeeStats | null> {
    const now = Date.now();
    
    // Return cached stats if still fresh
    if (this.cachedFeeStats && now - this.lastFetchTime < this.CACHE_TTL_MS) {
      return this.cachedFeeStats;
    }
    
    try {
      const response = await this.rpcServer.getFeeStats();
      
      if (!response?.sorobanInclusionFee) {
        this.logger.warn('getFeeStats returned invalid response');
        return null;
      }
      
      this.cachedFeeStats = response as FeeStats;
      this.lastFetchTime = now;
      
      this.logger.debug(
        `Fee stats updated: p50=${response.sorobanInclusionFee.p50}, ` +
        `p95=${response.sorobanInclusionFee.p95}, ` +
        `max=${response.sorobanInclusionFee.max}`,
      );
      
      return this.cachedFeeStats;
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch fee stats: ${error?.message || String(error)}`,
      );
      return null;
    }
  }

  /**
   * Calculates the maximum fee cap based on raffle prize value.
   * Low-stakes raffles get lower caps to avoid overspending.
   */
  private calculateFeeCap(rafflePrizeXLM?: number): number {
    if (!rafflePrizeXLM || rafflePrizeXLM < this.LOW_STAKES_THRESHOLD_XLM) {
      // Low stakes: cap at 0.1 XLM = 1,000,000 stroops
      return Math.min(1_000_000, this.MAX_FEE_CAP_STROOPS);
    }
    
    // High stakes: use full configured cap
    return this.MAX_FEE_CAP_STROOPS;
  }

  /**
   * Fallback estimate when fee stats are unavailable.
   * Uses conservative 2x base fee.
   */
  private buildFallbackEstimate(): FeeEstimate {
    const baseFee = this.BASE_FEE;
    const priorityFee = baseFee * 2;
    const totalFee = priorityFee;
    const cappedFee = Math.min(totalFee, this.MAX_FEE_CAP_STROOPS);
    
    return {
      baseFee,
      priorityFee,
      totalFee,
      cappedFee,
      isCapped: cappedFee < totalFee,
    };
  }

  /**
   * Clears the cached fee stats (useful for testing).
   */
  clearCache(): void {
    this.cachedFeeStats = null;
    this.lastFetchTime = 0;
  }
}
