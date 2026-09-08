import { OracleLoggerService } from '../logger/oracle-logger';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeeEstimatorService } from './fee-estimator.service';
import { MetricsService } from '../metrics/metrics.service';

export interface CostEstimate {
  expectedRevealsPerMonth: number;
  avgCostPerReveal: number;
  totalMonthlyCostStroops: number;
  totalMonthlyCostXLM: number;
  breakdown: {
    lowStakes: { count: number; avgFee: number; totalCost: number; method: 'PRNG' };
    highStakes: { count: number; avgFee: number; totalCost: number; method: 'VRF' };
  };
}

export interface ActualCostMetrics {
  totalReveals: number;
  totalCostStroops: number;
  avgCostPerReveal: number;
  totalCostXLM: number;
  byMethod: {
    prng: { count: number; totalCost: number };
    vrf: { count: number; totalCost: number };
  };
  periodStart: Date;
  periodEnd: Date;
}

export interface SubmissionCostEstimate {
  estimatedFeeXlm: string;
  baseFee: number;
  feeMultiplier: number;
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
export class FeeStrategyService {
  private readonly STROOPS_PER_XLM = 10_000_000;
  private readonly LOW_STAKES_THRESHOLD_XLM: number;
  private readonly PRNG_COMPUTATIONAL_COST = 0; 
  private readonly VRF_COMPUTATIONAL_COST = 50_000; 
  private readonly network: string;
  
  private actualCosts: Array<{
    timestamp: Date;
    raffleId: number;
    method: 'PRNG' | 'VRF';
    gasFee: number;
    totalCost: number;
  }> = [];
  
  private readonly COST_ALERT_THRESHOLD_PERCENT = 150; 
  private readonly HIGH_FEE_THRESHOLD_STROOPS = 5_000_000; 

  constructor(
    private readonly logger: OracleLoggerService,
    private readonly configService: ConfigService,
    private readonly feeEstimator: FeeEstimatorService,
    private readonly metricsService: MetricsService,
  ) {
    this.LOW_STAKES_THRESHOLD_XLM = parseFloat(
      this.configService.get<string>('LOW_STAKES_THRESHOLD_XLM') || '500',
    );
    this.network = this.configService.get<string>('NETWORK_PASSPHRASE') || 'testnet';
    this.logger.log(`FeeStrategyService initialized for network: ${this.network}`);
  }

  async estimateMonthlyCost(
    expectedRevealsPerMonth: number,
    lowStakesPercent: number = 70,
  ): Promise<CostEstimate> {
    if (expectedRevealsPerMonth <= 0) throw new Error('Expected reveals per month must be positive');
    if (lowStakesPercent < 0 || lowStakesPercent > 100) throw new Error('Low stakes percent must be between 0 and 100');
    
    const lowStakesCount = Math.floor((expectedRevealsPerMonth * lowStakesPercent) / 100);
    const highStakesCount = expectedRevealsPerMonth - lowStakesCount;
    
    const lowStakesFee = await this.feeEstimator.estimateFee(100); 
    const highStakesFee = await this.feeEstimator.estimateFee(1000); 
    
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
        lowStakes: { count: lowStakesCount, avgFee: lowStakesAvgCost, totalCost: lowStakesTotalCost, method: 'PRNG' },
        highStakes: { count: highStakesCount, avgFee: highStakesAvgCost, totalCost: highStakesTotalCost, method: 'VRF' },
      },
    };
    
    this.logger.log(`Monthly cost estimate: ${estimate.totalMonthlyCostXLM.toFixed(2)} XLM (${expectedRevealsPerMonth} reveals, ${lowStakesPercent}% low-stakes)`);
    this.metricsService.recordEstimatedFee(avgCostPerReveal, this.network, 'average');
    return estimate;
  }

  async estimateSubmissionCost(rafflePrizeXLM?: number): Promise<SubmissionCostEstimate> {
    const fee = await this.feeEstimator.estimateFee(rafflePrizeXLM);
    const baseFee = fee.baseFee;
    const surgeMultiplier = baseFee > 0 ? this.round(fee.priorityFee / baseFee, 2) : 1;
    const feeMultiplier = baseFee > 0 ? this.round(fee.cappedFee / baseFee, 2) : 1;
    const estimatedFeeXlm = (fee.cappedFee / this.STROOPS_PER_XLM).toFixed(7);
    return { estimatedFeeXlm, baseFee, feeMultiplier, surgeMultiplier };
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  recordRevealCost(raffleId: number, method: 'PRNG' | 'VRF', gasFee: number): void {
    const computationalCost = method === 'VRF' ? this.VRF_COMPUTATIONAL_COST : this.PRNG_COMPUTATIONAL_COST;
    const totalCost = gasFee + computationalCost;
    
    this.actualCosts.push({ timestamp: new Date(), raffleId, method, gasFee, totalCost });
    this.metricsService.recordActualFee(totalCost, this.network, method, raffleId);
    this.metricsService.recordSubmissionOutcome('success', this.network, method);
    
    if (gasFee > this.HIGH_FEE_THRESHOLD_STROOPS) {
      this.emitAlert({
        type: 'HIGH_FEE_DETECTED',
        message: `High gas fee detected: ${gasFee / this.STROOPS_PER_XLM} XLM`,
        severity: 'MEDIUM',
        details: { actual: gasFee, threshold: this.HIGH_FEE_THRESHOLD_STROOPS },
        timestamp: new Date(),
      });
    }
    this.logger.debug(`Recorded reveal cost: raffle ${raffleId}, method ${method}, gas ${gasFee} stroops, total ${totalCost} stroops`);
  }

  recordSubmissionFailure(raffleId: number, method: 'PRNG' | 'VRF', error: string): void {
    this.metricsService.recordSubmissionOutcome('failure', this.network, method);
    this.emitAlert({
      type: 'SUBMISSION_FAILED',
      message: `Submission failed for raffle ${raffleId}: ${error}`,
      severity: 'HIGH',
      details: { error },
      timestamp: new Date(),
    });
  }

  recordSubmissionRetry(raffleId: number, method: 'PRNG' | 'VRF'): void {
    this.metricsService.recordSubmissionOutcome('retry', this.network, method);
  }

  recordFeeBump(raffleId: number, method: 'PRNG' | 'VRF', feeMultiplier: number): void {
    this.metricsService.recordFeeBump(this.network, method);
    this.emitAlert({
      type: 'HIGH_FEE_DETECTED',
      message: `Fee bumped to ${feeMultiplier}x for raffle ${raffleId}`,
      severity: 'LOW',
      details: { actual: feeMultiplier },
      timestamp: new Date(),
    });
  }

  private emitAlert(alert: CostAlert): void {
    const severityPrefix = { 'LOW': 'ℹ️', 'MEDIUM': '⚠️', 'HIGH': '🚨' }[alert.severity];
    this.logger.warn(`${severityPrefix} [${alert.type}] ${alert.message}`);
    if (alert.severity === 'HIGH') this.logger.error(`CRITICAL COST ALERT: ${JSON.stringify(alert.details)}`);
  }

  getActualCosts(startDate: Date, endDate: Date = new Date()): ActualCostMetrics {
    const relevantCosts = this.actualCosts.filter((cost) => cost.timestamp >= startDate && cost.timestamp <= endDate);
    
    if (relevantCosts.length === 0) {
      return {
        totalReveals: 0, totalCostStroops: 0, avgCostPerReveal: 0, totalCostXLM: 0,
        byMethod: { prng: { count: 0, totalCost: 0 }, vrf: { count: 0, totalCost: 0 } },
        periodStart: startDate, periodEnd: endDate,
      };
    }
    
    const totalCostStroops = relevantCosts.reduce((sum, cost) => sum + cost.totalCost, 0);
    const prngCosts = relevantCosts.filter((c) => c.method === 'PRNG');
    const vrfCosts = relevantCosts.filter((c) => c.method === 'VRF');
    
    return {
      totalReveals: relevantCosts.length,
      totalCostStroops,
      avgCostPerReveal: Math.floor(totalCostStroops / relevantCosts.length),
      totalCostXLM: totalCostStroops / this.STROOPS_PER_XLM,
      byMethod: {
        prng: { count: prngCosts.length, totalCost: prngCosts.reduce((sum, c) => sum + c.totalCost, 0) },
        vrf: { count: vrfCosts.length, totalCost: vrfCosts.reduce((sum, c) => sum + c.totalCost, 0) },
      },
      periodStart: startDate,
      periodEnd: endDate,
    };
  }

  async checkCostThresholds(estimate: CostEstimate, actualMetrics: ActualCostMetrics): Promise<CostAlert[]> {
    const alerts: CostAlert[] = [];
    const estimatedAvg = estimate.avgCostPerReveal;
    const actualAvg = actualMetrics.avgCostPerReveal;
    
    if (actualAvg > 0 && estimatedAvg > 0) {
      const exceedancePercent = ((actualAvg - estimatedAvg) / estimatedAvg) * 100;
      if (exceedancePercent > this.COST_ALERT_THRESHOLD_PERCENT - 100) {
        alerts.push({
          type: 'COST_EXCEEDED',
          message: `Actual costs exceed estimate by ${exceedancePercent.toFixed(1)}%`,
          severity: exceedancePercent > 200 ? 'HIGH' : 'MEDIUM',
          details: { estimated: estimatedAvg, actual: actualAvg, threshold: this.COST_ALERT_THRESHOLD_PERCENT, exceedancePercent },
          timestamp: new Date(),
        });
      }
    }
    
    const daysInPeriod = Math.ceil((actualMetrics.periodEnd.getTime() - actualMetrics.periodStart.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysInPeriod > 0) {
      const projectedMonthlyCost = (actualMetrics.totalCostStroops / daysInPeriod) * 30;
      const budgetUsagePercent = (projectedMonthlyCost / estimate.totalMonthlyCostStroops) * 100;
      
      if (budgetUsagePercent > 90) {
        alerts.push({
          type: 'BUDGET_WARNING',
          message: `Projected to use ${budgetUsagePercent.toFixed(1)}% of monthly budget`,
          severity: budgetUsagePercent > 120 ? 'HIGH' : 'MEDIUM',
          details: { estimated: estimate.totalMonthlyCostStroops, actual: projectedMonthlyCost },
          timestamp: new Date(),
        });
      }
    }
    
    return alerts;
  }

  getCostPerRevealMetric(): number {
    if (this.actualCosts.length === 0) return 0;
    const recentCosts = this.actualCosts.slice(-100);
    const totalCost = recentCosts.reduce((sum, cost) => sum + cost.totalCost, 0);
    return Math.floor(totalCost / recentCosts.length);
  }

  clearCostHistory(): void {
    this.actualCosts = [];
    this.logger.log('Cost history cleared');
  }
}
