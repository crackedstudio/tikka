import { ConfigService } from '@nestjs/config';
import { FeeStrategyService } from './fee-strategy';
import { FeeEstimatorService } from './fee-estimator.service';
import { MetricsService } from '../metrics/metrics.service';
import { OracleLoggerService } from '../logger/oracle-logger';

describe('FeeStrategyService', () => {
  let estimateFee: jest.Mock;
  let metrics: { recordEstimatedFee: jest.Mock; recordActualFee: jest.Mock; recordSubmissionOutcome: jest.Mock; recordFeeBump: jest.Mock };
  let strategy: FeeStrategyService;

  beforeEach(() => {
    estimateFee = jest.fn();
    metrics = {
      recordEstimatedFee: jest.fn(),
      recordActualFee: jest.fn(),
      recordSubmissionOutcome: jest.fn(),
      recordFeeBump: jest.fn(),
    };
    strategy = new FeeStrategyService(
      { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as OracleLoggerService,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      { estimateFee } as unknown as FeeEstimatorService,
      metrics as unknown as MetricsService,
    );
  });

  it('reports a calm surge when priority is only twice the base fee', async () => {
    estimateFee.mockResolvedValue({ baseFee: 100, priorityFee: 200, totalFee: 200, cappedFee: 200, isCapped: false });
    const cost = await strategy.estimateSubmissionCost(100);

    expect(cost).toEqual({
      estimatedFeeXlm: '0.0000200',
      baseFee: 100,
      feeMultiplier: 2,
      surgeMultiplier: 2,
    });
  });

  it('reports the surge from a congested p95 while charging the capped fee', async () => {
    estimateFee.mockResolvedValue({
      baseFee: 100,
      priorityFee: 3_000_000,
      totalFee: 3_000_000,
      cappedFee: 1_000_000,
      isCapped: true,
    });
    const cost = await strategy.estimateSubmissionCost(100);

    expect(cost.surgeMultiplier).toBe(30000);
    expect(cost.feeMultiplier).toBe(10000);
    expect(cost.estimatedFeeXlm).toBe('0.1000000');
  });

  it('prices a high-stakes reveal from the uncapped inclusion fee', async () => {
    estimateFee.mockResolvedValue({
      baseFee: 100,
      priorityFee: 3_000_000,
      totalFee: 3_000_000,
      cappedFee: 3_000_000,
      isCapped: false,
    });
    const cost = await strategy.estimateSubmissionCost(600);

    expect(cost.feeMultiplier).toBe(30000);
    expect(cost.estimatedFeeXlm).toBe('0.3000000');
  });

  it('splits a monthly estimate between low-stakes PRNG and high-stakes VRF reveals', async () => {
    estimateFee.mockImplementation(async (prize?: number) => {
      if (prize === 1000) {
        return { cappedFee: 500_000, baseFee: 100, priorityFee: 500_000, totalFee: 500_000, isCapped: false };
      }
      return { cappedFee: 200, baseFee: 100, priorityFee: 200, totalFee: 200, isCapped: false };
    });

    const estimate = await strategy.estimateMonthlyCost(100, 70);

    expect(estimate.breakdown.lowStakes).toMatchObject({ count: 70, method: 'PRNG', avgFee: 200 });
    expect(estimate.breakdown.highStakes).toMatchObject({ count: 30, method: 'VRF', avgFee: 550_000 });
    expect(estimate.totalMonthlyCostStroops).toBe(70 * 200 + 30 * 550_000);
    expect(metrics.recordEstimatedFee).toHaveBeenCalled();
  });

  it('alerts when a recorded gas fee crosses the high-fee threshold', () => {
    const warn = jest.spyOn((strategy as any).logger, 'warn');
    strategy.recordRevealCost(4, 'VRF', 5_000_001);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('HIGH_FEE_DETECTED'));
    expect(metrics.recordSubmissionOutcome).toHaveBeenCalledWith('success', 'testnet', 'VRF');
  });

  it('flags actual cost that exceeds the estimate and a budget that will overrun', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-01-11T00:00:00Z');
    strategy.recordRevealCost(1, 'PRNG', 1_000);
    const actual = strategy.getActualCosts(start, end);
    actual.avgCostPerReveal = 200;
    actual.totalCostStroops = 10_000_000;
    actual.periodStart = start;
    actual.periodEnd = end;

    const alerts = await strategy.checkCostThresholds(
      {
        expectedRevealsPerMonth: 10,
        avgCostPerReveal: 100,
        totalMonthlyCostStroops: 1_000_000,
        totalMonthlyCostXLM: 0.1,
        breakdown: {
          lowStakes: { count: 10, avgFee: 100, totalCost: 1000, method: 'PRNG' },
          highStakes: { count: 0, avgFee: 0, totalCost: 0, method: 'VRF' },
        },
      },
      actual,
    );

    expect(alerts.map((alert) => alert.type)).toEqual(expect.arrayContaining(['COST_EXCEEDED', 'BUDGET_WARNING']));
  });
});
