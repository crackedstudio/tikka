import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type FeeSource = 'network' | 'cache' | 'fallback';
export type FeeConfidence = 'high' | 'low';

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
  source: FeeSource;
  confidence: FeeConfidence;
}

/** Thrown when the estimated fee falls outside the configured safe range. */
export class FeeUnsafeError extends Error {
  constructor(
    public readonly reason: 'below_min' | 'above_max',
    public readonly fee: number,
    public readonly bound: number,
  ) {
    super(
      reason === 'below_min'
        ? `Fee ${fee} stroops is below minimum ${bound} stroops`
        : `Fee ${fee} stroops exceeds maximum ${bound} stroops`,
    );
    this.name = 'FeeUnsafeError';
  }
}

@Injectable()
export class FeeEstimatorService {
  private readonly logger = new Logger(FeeEstimatorService.name);
  private readonly rpcServer: any;

  private readonly BASE_FEE = 100; // stroops
  private readonly HIGH_PRIORITY_PERCENTILE = 95; // Use p95 for oracle reveals
  private readonly MAX_FEE_CAP_STROOPS: number;
  private readonly MIN_FEE_STROOPS: number;
  private readonly LOW_STAKES_THRESHOLD_XLM: number;

  private cachedFeeStats: FeeStats | null = null;
  private lastFetchTime = 0;
  private readonly CACHE_TTL_MS = 10_000; // 10 seconds

  constructor(private readonly configService: ConfigService) {
    const rpcUrl =
      this.configService.get<string>('SOROBAN_RPC_URL') ||
      'https://soroban-testnet.stellar.org';

    const StellarSdk = require('@stellar/stellar-sdk');
    this.rpcServer = new StellarSdk.rpc.Server(rpcUrl);

    // Fee cap: default 10 XLM = 100,000,000 stroops
    this.MAX_FEE_CAP_STROOPS = parseInt(
      this.configService.get<string>('ORACLE_MAX_FEE_STROOPS') || '100000000',
      10,
    );

    // Min fee: default 100 stroops (Stellar base fee)
    this.MIN_FEE_STROOPS = parseInt(
      this.configService.get<string>('ORACLE_MIN_FEE_STROOPS') || '100',
      10,
    );

    // Low stakes threshold: default 500 XLM
    this.LOW_STAKES_THRESHOLD_XLM = parseFloat(
      this.configService.get<string>('LOW_STAKES_THRESHOLD_XLM') || '500',
    );

    this.logger.log(
      `FeeEstimator initialized: min ${this.MIN_FEE_STROOPS}, ` +
        `max cap ${this.MAX_FEE_CAP_STROOPS} stroops, ` +
        `low stakes threshold ${this.LOW_STAKES_THRESHOLD_XLM} XLM`,
    );
  }

  /**
   * Estimates the optimal fee for oracle reveal transactions.
   * Uses high priority (p95) to ensure execution during congestion.
   * Applies cap to avoid excessive spending on low-stakes raffles.
   *
   * @throws {FeeUnsafeError} if the resulting fee is outside the configured safe range.
   */
  async estimateFee(rafflePrizeXLM?: number): Promise<FeeEstimate> {
    const { stats, source } = await this.getFeeStats();

    if (!stats) {
      this.logger.warn('Fee stats unavailable, using fallback fee');
      const estimate = this.buildFallbackEstimate();
      this.assertSafe(estimate.cappedFee, estimate.totalFee);
      return estimate;
    }

    const baseFee = this.BASE_FEE;
    const p95Fee = parseInt(stats.sorobanInclusionFee.p95, 10);
    const priorityFee = Math.max(p95Fee, baseFee);
    const totalFee = priorityFee;

    const cap = this.calculateFeeCap(rafflePrizeXLM);
    const cappedFee = Math.min(totalFee, cap);
    const isCapped = cappedFee < totalFee;

    if (isCapped) {
      this.logger.warn(
        `Fee capped at ${cappedFee} stroops (original: ${totalFee}, ` +
          `prize: ${rafflePrizeXLM || 'unknown'} XLM)`,
      );
    }

    const estimate: FeeEstimate = {
      baseFee,
      priorityFee,
      totalFee,
      cappedFee,
      isCapped,
      source,
      confidence: 'high',
    };

    this.assertSafe(cappedFee, totalFee);
    return estimate;
  }

  /**
   * Fetches current fee statistics from Soroban RPC.
   * Results are cached for CACHE_TTL_MS to reduce RPC load.
   */
  private async getFeeStats(): Promise<{ stats: FeeStats | null; source: FeeSource }> {
    const now = Date.now();

    if (this.cachedFeeStats && now - this.lastFetchTime < this.CACHE_TTL_MS) {
      return { stats: this.cachedFeeStats, source: 'cache' };
    }

    try {
      const response = await this.rpcServer.getFeeStats();

      if (!response?.sorobanInclusionFee) {
        this.logger.warn('getFeeStats returned invalid response');
        return { stats: null, source: 'fallback' };
      }

      this.cachedFeeStats = response as FeeStats;
      this.lastFetchTime = now;

      this.logger.debug(
        `Fee stats updated: p50=${response.sorobanInclusionFee.p50}, ` +
          `p95=${response.sorobanInclusionFee.p95}, ` +
          `max=${response.sorobanInclusionFee.max}`,
      );

      return { stats: this.cachedFeeStats, source: 'network' };
    } catch (error: any) {
      this.logger.error(`Failed to fetch fee stats: ${error?.message || String(error)}`);
      return { stats: null, source: 'fallback' };
    }
  }

  /**
   * Calculates the maximum fee cap based on raffle prize value.
   */
  private calculateFeeCap(rafflePrizeXLM?: number): number {
    if (!rafflePrizeXLM || rafflePrizeXLM < this.LOW_STAKES_THRESHOLD_XLM) {
      return Math.min(1_000_000, this.MAX_FEE_CAP_STROOPS);
    }
    return this.MAX_FEE_CAP_STROOPS;
  }

  /**
   * Fallback estimate when fee stats are unavailable.
   * Uses conservative 2x base fee with low confidence.
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
      source: 'fallback',
      confidence: 'low',
    };
  }

  /**
   * Asserts that fee values are within the configured safe range.
   * - cappedFee must be >= MIN (ensures we don't underpay after capping)
   * - totalFee must be <= MAX (ensures the network fee isn't wildly above our cap)
   * @throws {FeeUnsafeError}
   */
  private assertSafe(cappedFee: number, totalFee: number): void {
    if (cappedFee < this.MIN_FEE_STROOPS) {
      throw new FeeUnsafeError('below_min', cappedFee, this.MIN_FEE_STROOPS);
    }
    if (totalFee > this.MAX_FEE_CAP_STROOPS) {
      throw new FeeUnsafeError('above_max', totalFee, this.MAX_FEE_CAP_STROOPS);
    }
  }

  /** Clears the cached fee stats (useful for testing). */
  clearCache(): void {
    this.cachedFeeStats = null;
    this.lastFetchTime = 0;
  }
}
