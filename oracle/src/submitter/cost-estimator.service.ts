import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeeEstimatorService } from './fee-estimator.service';
import { MetricsService } from '../metrics/metrics.service';

export interface CostEstimate {
  /** Number of reveals expected per month */
  expectedRevealsPerMonth: number;
  /** Average cost per reveal in stroops */
  avgCostPerReveal: number;
  /** Total estimated monthly cost in stroops */
  totalMonthlyCostStroops: number;
  /** Total estimated monthly cost in XLM */
  totalMonthlyCostXLM: number;
  /** Breakdown by raffle type */
  breakdown: {
    lowStakes: {
      count: number;
      avgFee: number;
      totalCost: number;
      method: 'PRNG';
    };
    highStakes: {
      count: number;
      avgFee: number;
      totalCost: number;
      method: 'VRF';
    };
  };
}

export interface ActualCostMetrics {
  /** Total reveals processed */
  totalReveals: number;
  /** Total cost spent in stroops */
  totalCostStroops: number;
  /** Average cost per reveal in stroops */
  avgCostPerReveal: number;
  /** Total cost in XLM */
  totalCostXLM: number;
  /** Breakdown by method */
  byMethod: {
    prng: { count: number; totalCost: number };
    vrf: { count: number; totalCost: number };
  };
  /** Time period */
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Per-submission cost breakdown for a single randomness transaction.
 * Exposed to operators (e.g. via the admin API) for funding planning.
 */
export interface SubmissionCostEstimate {
  /** Estimated fee for one submission, in XLM (string to preserve precision) */
  estimatedFeeXlm: string;
  /** Network base fee in stroops */
  baseFee: number;
  /** Effective multiplier applied to the base fee after capping */
  feeMultiplier: number;
  /** Network congestion surge: how much the priority fee exceeds the base fee */
  surgeMultiplier: number;
}

export interface CostAlert {
  type: 'COST_EXCEEDED' | 'HIGH_FEE_DETECTED' | 'BUDGET_WARNING' | 'SUBMISSION_FAILED';
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  details: {
    estimated?: number;
    actual?: number;
    threshold?: number;
    exceedancePercent?: number;
    error?: string;
  };
  timestamp: Date;
}

@Injectable()
export class CostEstimatorService {
  private readonly logger = new Logger(CostEstimatorService.name);
  
  private readonly STROOPS_PER_XLM = 10_000_000;
  private readonly LOW_STAKES_THRESHOLD_XLM: number;
  private readonly PRNG_COMPUTATIONAL_COST = 0; // PRNG is essentially free
  private readonly VRF_COMPUTATIONAL_COST = 50_000; // ~0.005 XLM for VRF computation
  private readonly network: string;
  
  // Cost tracking
  private actualCosts: Array<{
    timestamp: Date;
    raffleId: number;
    method: 'PRNG' | 'VRF';
    gasFee: number;
    totalCost: number;
  }> = [];
  
  // Alert thresholds
  private readonly COST_ALERT_THRESHOLD_PERCENT = 150; // Alert if actual > 150% of estimate
  private readonly HIGH_FEE_THRESHOLD_STROOPS = 5_000_000; // Alert if single fee > 0.5 XLM

  constructor(
    private readonly configService: ConfigService,
    private readonly feeEstimator: FeeEstimatorService,
    private readonly metricsService: MetricsService,
  ) {
    this.LOW_STAKES_THRESHOLD_XLM = parseFloat(
      this.configService.get<string>('LOW_STAKES_THRESHOLD_XLM') || '500',
    );
    this.network = this.configService.get<string>('NETWORK_PASSPHRASE') || 'testnet';
    
    this.logger.log(`CostEstimator initialized for network: ${this.network}`);
  }

  /**
   * Estimates monthly operating costs based on expected raffle volume.
   * 
   * @param expectedRevealsPerMonth - Expected number of randomness reveals per month
   * @param lowStakesPercent - Percentage of reveals that are low-stakes (0-100)
   * @returns Detailed cost estimate
   */
  async estimateMonthlyCost(
    expectedRevealsPerMonth: number,
    lowStakesPercent: number = 70, // Default: 70% low-stakes, 30% high-stakes
  ): Promise<CostEstimate> {
    if (expectedRevealsPerMonth <= 0) {
      throw new Error('Expected reveals per month must be positive');
    }
    
    if (lowStakesPercent < 0 || lowStakesPercent > 100) {
      throw new Error('Low stakes percent must be between 0 and 100');
    }
    
    // Calculate distribution
    const lowStakesCount = Math.floor((expectedRevealsPerMonth * lowStakesPercent) / 100);
    const highStakesCount = expectedRevealsPerMonth - lowStakesCount;
    
    // Get fee estimates for each type
    const lowStakesFee = await this.feeEstimator.estimateFee(100); // 100 XLM example
    const highStakesFee = await this.feeEstimator.estimateFee(1000); // 1000 XLM example
    
    // Calculate costs including computational overhead
    const lowStakesAvgCost = lowStakesFee.cappedFee + this.PRNG_COMPUTATIONAL_COST;
    const highStakesAvgCost = highStakesFee.cappedFee + this.VRF_COMPUTATIONAL_COST;
    
    const lowStakesTotalCost = lowStakesCount * lowStakesAvgCost;
    const highStakesTotalCost = highStakesCount * highStakesAvgCost;
    const totalCostStroops = lowStakesTotalCost + highStakesTotalCost;
    
    const avgCostPerReveal = Math.floor(totalCostStroops / expectedRevealsPerMonth);
    
    const estimate: CostEstimate = {
      expectedRevealsPerMonth,
      avgCostPerReveal,
      totalMonthlyCostStroops: totalCostStroops,
      totalMonthlyCostXLM: totalCostStroops / this.STROOPS_PER_XLM,
      breakdown: {
        lowStakes: {
          count: lowStakesCount,
          avgFee: lowStakesAvgCost,
          totalCost: lowStakesTotalCost,
          method: 'PRNG',
        },
        highStakes: {
          count: highStakesCount,
          avgFee: highStakesAvgCost,
          totalCost: highStakesTotalCost,
          method: 'VRF',
        },
      },
    };
    
    this.logger.log(
      `Monthly cost estimate: ${estimate.totalMonthlyCostXLM.toFixed(2)} XLM ` +
      `(${expectedRevealsPerMonth} reveals, ${lowStakesPercent}% low-stakes)`,
    );

    // Record estimated fee metric
    this.metricsService.recordEstimatedFee(avgCostPerReveal, this.network, 'average');
    
    return estimate;
  }

  /**
   * Estimates the cost of submitting a single randomness transaction.
   * Derives a per-submission breakdown from the current network fee stats,
   * suitable for operator funding planning via the admin API.
   *
   * @param rafflePrizeXLM - Optional prize value used to select the fee cap tier
   * @returns Cost breakdown with the estimated fee expressed in XLM
   */
  async estimateSubmissionCost(
    rafflePrizeXLM?: number,
  ): Promise<SubmissionCostEstimate> {
    const fee = await this.feeEstimator.estimateFee(rafflePrizeXLM);

    const baseFee = fee.baseFee;
    // Surge: how much the network's priority (p95) fee exceeds the base fee.
    const surgeMultiplier =
      baseFee > 0 ? this.round(fee.priorityFee / baseFee, 2) : 1;
    // Effective multiplier applied to the base fee once the cap is enforced.
    const feeMultiplier =
      baseFee > 0 ? this.round(fee.cappedFee / baseFee, 2) : 1;
    const estimatedFeeXlm = (fee.cappedFee / this.STROOPS_PER_XLM).toFixed(7);

    return { estimatedFeeXlm, baseFee, feeMultiplier, surgeMultiplier };
  }

  /**
   * Rounds a number to the given number of decimal places.
   */
  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  /**
   * Records the actual cost of a reveal operation.
   * Used for tracking and alerting.
   */
  recordRevealCost(
    raffleId: number,
    method: 'PRNG' | 'VRF',
    gasFee: number,
  ): void {
    const computationalCost = method === 'VRF' 
      ? this.VRF_COMPUTATIONAL_COST 
      : this.PRNG_COMPUTATIONAL_COST;
    
    const totalCost = gasFee + computationalCost;
    
    this.actualCosts.push({
      timestamp: new Date(),
      raffleId,
      method,
      gasFee,
      totalCost,
    });

    // Record metrics
    this.metricsService.recordActualFee(totalCost, this.network, method, raffleId);
    this.metricsService.recordSubmissionOutcome('success', this.network, method);
    
    // Check for high fee alert
    if (gasFee > this.HIGH_FEE_THRESHOLD_STROOPS) {
      this.emitAlert({
        type: 'HIGH_FEE_DETECTED',
        message: `High gas fee detected: ${gasFee / this.STROOPS_PER_XLM} XLM`,
        severity: 'MEDIUM',
        details: {
          actual: gasFee,
          threshold: this.HIGH_FEE_THRESHOLD_STROOPS,
        },
        timestamp: new Date(),
      });
    }
    
    this.logger.debug(
      `Recorded reveal cost: raffle ${raffleId}, method ${method}, ` +
      `gas ${gasFee} stroops, total ${totalCost} stroops`,
    );
  }

  /**
   * Records a failed submission outcome.
   */
  recordSubmissionFailure(
    raffleId: number,
    method: 'PRNG' | 'VRF',
    error: string,
  ): void {
    this.metricsService.recordSubmissionOutcome('failure', this.network, method);
    
    this.emitAlert({
      type: 'SUBMISSION_FAILED',
      message: `Submission failed for raffle ${raffleId}: ${error}`,
      severity: 'HIGH',
      details: {
        error,
      },
      timestamp: new Date(),
    });
  }

  /**
   * Records a submission retry.
   */
  recordSubmissionRetry(
    raffleId: number,
    method: 'PRNG' | 'VRF',
  ): void {
    this.metricsService.recordSubmissionOutcome('retry', this.network, method);
  }

  /**
   * Emits an alert for abnormal cost or submission issues.
   */
  private emitAlert(alert: CostAlert): void {
    const severityPrefix = {
      'LOW': 'ℹ️',
      'MEDIUM': '⚠️',
      'HIGH': '🚨',
    }[alert.severity];

    this.logger.warn(`${severityPrefix} [${alert.type}] ${alert.message}`);
    
    // In a real system, this could send to Slack/PagerDuty/etc.
    if (alert.severity === 'HIGH') {
      this.logger.error(`CRITICAL COST ALERT: ${JSON.stringify(alert.details)}`);
    }
  }

  /**
   * Gets actual cost metrics for a time period.
   */
  getActualCosts(
    startDate: Date,
    endDate: Date = new Date(),
  ): ActualCostMetrics {
    const relevantCosts = this.actualCosts.filter(
      (cost) => cost.timestamp >= startDate && cost.timestamp <= endDate,
    );
    
    if (relevantCosts.length === 0) {
      return {
        totalReveals: 0,
        totalCostStroops: 0,
        avgCostPerReveal: 0,
        totalCostXLM: 0,
        byMethod: {
          prng: { count: 0, totalCost: 0 },
          vrf: { count: 0, totalCost: 0 },
        },
        periodStart: startDate,
        periodEnd: endDate,
      };
    }
    
    const totalCostStroops = relevantCosts.reduce(
      (sum, cost) => sum + cost.totalCost,
      0,
    );
    
    const prngCosts = relevantCosts.filter((c) => c.method === 'PRNG');
    const vrfCosts = relevantCosts.filter((c) => c.method === 'VRF');
    
    return {
      totalReveals: relevantCosts.length,
      totalCostStroops,
      avgCostPerReveal: Math.floor(totalCostStroops / relevantCosts.length),
      totalCostXLM: totalCostStroops / this.STROOPS_PER_XLM,
      byMethod: {
        prng: {
          count: prngCosts.length,
          totalCost: prngCosts.reduce((sum, c) => sum + c.totalCost, 0),
        },
        vrf: {
          count: vrfCosts.length,
          totalCost: vrfCosts.reduce((sum, c) => sum + c.totalCost, 0),
        },
      },
      periodStart: startDate,
      periodEnd: endDate,
    };
  }

  /**
   * Compares actual costs against estimate and generates alerts if needed.
   */
  async checkCostThresholds(
    estimate: CostEstimate,
    actualMetrics: ActualCostMetrics,
  ): Promise<CostAlert[]> {
    const alerts: CostAlert[] = [];
    
    // Check if actual cost significantly exceeds estimate
    const estimatedAvg = estimate.avgCostPerReveal;
    const actualAvg = actualMetrics.avgCostPerReveal;
    
    if (actualAvg > 0 && estimatedAvg > 0) {
      const exceedancePercent = ((actualAvg - estimatedAvg) / estimatedAvg) * 100;
      
      if (exceedancePercent > this.COST_ALERT_THRESHOLD_PERCENT - 100) {
        alerts.push({
          type: 'COST_EXCEEDED',
          message: `Actual costs exceed estimate by ${exceedancePercent.toFixed(1)}%`,
          severity: exceedancePercent > 200 ? 'HIGH' : 'MEDIUM',
          details: {
            estimated: estimatedAvg,
            actual: actualAvg,
            threshold: this.COST_ALERT_THRESHOLD_PERCENT,
            exceedancePercent,
          },
          timestamp: new Date(),
        });
      }
    }
    
    // Check if approaching monthly budget
    const daysInPeriod = Math.ceil(
      (actualMetrics.periodEnd.getTime() - actualMetrics.periodStart.getTime()) /
      (1000 * 60 * 60 * 24),
    );
    
    if (daysInPeriod > 0) {
      const projectedMonthlyCost = (actualMetrics.totalCostStroops / daysInPeriod) * 30;
      const budgetUsagePercent = (projectedMonthlyCost / estimate.totalMonthlyCostStroops) * 100;
      
      if (budgetUsagePercent > 90) {
        alerts.push({
          type: 'BUDGET_WARNING',
          message: `Projected to use ${budgetUsagePercent.toFixed(1)}% of monthly budget`,
          severity: budgetUsagePercent > 120 ? 'HIGH' : 'MEDIUM',
          details: {
            estimated: estimate.totalMonthlyCostStroops,
            actual: projectedMonthlyCost,
          },
          timestamp: new Date(),
        });
      }
    }
    
    return alerts;
  }

  /**
   * Gets the cost per reveal metric for monitoring.
   */
  getCostPerRevealMetric(): number {
    if (this.actualCosts.length === 0) {
      return 0;
    }
    
    const recentCosts = this.actualCosts.slice(-100); // Last 100 reveals
    const totalCost = recentCosts.reduce((sum, cost) => sum + cost.totalCost, 0);
    
    return Math.floor(totalCost / recentCosts.length);
  }

  /**
   * Clears cost history (useful for testing or monthly resets).
   */
  clearCostHistory(): void {
    this.actualCosts = [];
    this.logger.log('Cost history cleared');
  }
}
