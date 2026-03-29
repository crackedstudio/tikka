import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeeEstimatorService } from './fee-estimator.service';

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

export interface CostAlert {
  type: 'COST_EXCEEDED' | 'HIGH_FEE_DETECTED' | 'BUDGET_WARNING';
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  details: {
    estimated?: number;
    actual?: number;
    threshold?: number;
    exceedancePercent?: number;
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
  ) {
    this.LOW_STAKES_THRESHOLD_XLM = parseFloat(
      this.configService.get<string>('LOW_STAKES_THRESHOLD_XLM') || '500',
    );
    
    this.logger.log('CostEstimator initialized');
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
    
    return estimate;
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

  /**
   * Emits a cost alert (can be extended to send to monitoring systems).
   */
  private emitAlert(alert: CostAlert): void {
    const logLevel = alert.severity === 'HIGH' ? 'error' : 'warn';
    this.logger[logLevel](
      `[COST ALERT] ${alert.type}: ${alert.message}`,
      JSON.stringify(alert.details),
    );
    
    // TODO: Send to monitoring system (e.g., Datadog, Prometheus, Slack webhook)
  }
}
