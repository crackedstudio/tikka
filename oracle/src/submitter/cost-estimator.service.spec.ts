import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CostEstimatorService } from './cost-estimator.service';
import { FeeEstimatorService } from './fee-estimator.service';

describe('CostEstimatorService', () => {
  let service: CostEstimatorService;
  let feeEstimator: jest.Mocked<FeeEstimatorService>;

  beforeEach(async () => {
    const mockFeeEstimator = {
      estimateFee: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CostEstimatorService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'LOW_STAKES_THRESHOLD_XLM') return '500';
              return undefined;
            }),
          },
        },
        {
          provide: FeeEstimatorService,
          useValue: mockFeeEstimator,
        },
      ],
    }).compile();

    service = module.get<CostEstimatorService>(CostEstimatorService);
    feeEstimator = module.get(FeeEstimatorService) as jest.Mocked<FeeEstimatorService>;
  });

  afterEach(() => {
    service.clearCostHistory();
  });

  describe('estimateMonthlyCost', () => {
    it('should calculate monthly cost for expected volume', async () => {
      // Mock fee estimates
      feeEstimator.estimateFee
        .mockResolvedValueOnce({
          baseFee: 100,
          priorityFee: 200,
          totalFee: 200,
          cappedFee: 200,
          isCapped: false,
        })
        .mockResolvedValueOnce({
          baseFee: 100,
          priorityFee: 300,
          totalFee: 300,
          cappedFee: 300,
          isCapped: false,
        });

      const estimate = await service.estimateMonthlyCost(1000, 70);

      expect(estimate.expectedRevealsPerMonth).toBe(1000);
      expect(estimate.breakdown.lowStakes.count).toBe(700);
      expect(estimate.breakdown.highStakes.count).toBe(300);
      expect(estimate.totalMonthlyCostStroops).toBeGreaterThan(0);
      expect(estimate.totalMonthlyCostXLM).toBe(
        estimate.totalMonthlyCostStroops / 10_000_000,
      );
    });

    it('should include computational costs in estimates', async () => {
      feeEstimator.estimateFee.mockResolvedValue({
        baseFee: 100,
        priorityFee: 200,
        totalFee: 200,
        cappedFee: 200,
        isCapped: false,
      });

      const estimate = await service.estimateMonthlyCost(100, 50);

      // VRF should have higher cost due to computational overhead
      expect(estimate.breakdown.highStakes.avgFee).toBeGreaterThan(
        estimate.breakdown.lowStakes.avgFee,
      );
    });

    it('should handle 100% low-stakes scenario', async () => {
      feeEstimator.estimateFee.mockResolvedValue({
        baseFee: 100,
        priorityFee: 200,
        totalFee: 200,
        cappedFee: 200,
        isCapped: false,
      });

      const estimate = await service.estimateMonthlyCost(500, 100);

      expect(estimate.breakdown.lowStakes.count).toBe(500);
      expect(estimate.breakdown.highStakes.count).toBe(0);
      expect(estimate.breakdown.highStakes.totalCost).toBe(0);
    });

    it('should handle 100% high-stakes scenario', async () => {
      feeEstimator.estimateFee.mockResolvedValue({
        baseFee: 100,
        priorityFee: 300,
        totalFee: 300,
        cappedFee: 300,
        isCapped: false,
      });

      const estimate = await service.estimateMonthlyCost(500, 0);

      expect(estimate.breakdown.lowStakes.count).toBe(0);
      expect(estimate.breakdown.highStakes.count).toBe(500);
      expect(estimate.breakdown.lowStakes.totalCost).toBe(0);
    });

    it('should throw error for invalid reveals count', async () => {
      await expect(service.estimateMonthlyCost(0, 70)).rejects.toThrow(
        'Expected reveals per month must be positive',
      );

      await expect(service.estimateMonthlyCost(-100, 70)).rejects.toThrow(
        'Expected reveals per month must be positive',
      );
    });

    it('should throw error for invalid percentage', async () => {
      await expect(service.estimateMonthlyCost(1000, -10)).rejects.toThrow(
        'Low stakes percent must be between 0 and 100',
      );

      await expect(service.estimateMonthlyCost(1000, 150)).rejects.toThrow(
        'Low stakes percent must be between 0 and 100',
      );
    });

    it('should calculate correct average cost per reveal', async () => {
      feeEstimator.estimateFee
        .mockResolvedValueOnce({
          baseFee: 100,
          priorityFee: 1000,
          totalFee: 1000,
          cappedFee: 1000,
          isCapped: false,
        })
        .mockResolvedValueOnce({
          baseFee: 100,
          priorityFee: 2000,
          totalFee: 2000,
          cappedFee: 2000,
          isCapped: false,
        });

      const estimate = await service.estimateMonthlyCost(100, 50);

      const expectedAvg = Math.floor(estimate.totalMonthlyCostStroops / 100);
      expect(estimate.avgCostPerReveal).toBe(expectedAvg);
    });
  });

  describe('recordRevealCost', () => {
    it('should record PRNG reveal cost', () => {
      service.recordRevealCost(1, 'PRNG', 200);

      const metrics = service.getActualCosts(
        new Date(Date.now() - 1000),
        new Date(),
      );

      expect(metrics.totalReveals).toBe(1);
      expect(metrics.byMethod.prng.count).toBe(1);
      expect(metrics.byMethod.vrf.count).toBe(0);
    });

    it('should record VRF reveal cost with computational overhead', () => {
      service.recordRevealCost(1, 'VRF', 300);

      const metrics = service.getActualCosts(
        new Date(Date.now() - 1000),
        new Date(),
      );

      expect(metrics.totalReveals).toBe(1);
      expect(metrics.byMethod.vrf.count).toBe(1);
      // VRF should include computational cost
      expect(metrics.byMethod.vrf.totalCost).toBeGreaterThan(300);
    });

    it('should record multiple reveals', () => {
      service.recordRevealCost(1, 'PRNG', 200);
      service.recordRevealCost(2, 'VRF', 300);
      service.recordRevealCost(3, 'PRNG', 250);

      const metrics = service.getActualCosts(
        new Date(Date.now() - 1000),
        new Date(),
      );

      expect(metrics.totalReveals).toBe(3);
      expect(metrics.byMethod.prng.count).toBe(2);
      expect(metrics.byMethod.vrf.count).toBe(1);
    });
  });

  describe('getActualCosts', () => {
    it('should return metrics for specified time period', () => {
      const now = new Date();
      const oneSecondAgo = new Date(now.getTime() - 1000);

      service.recordRevealCost(1, 'PRNG', 200);
      service.recordRevealCost(2, 'VRF', 300);

      const metrics = service.getActualCosts(oneSecondAgo, new Date(now.getTime() + 1000));

      expect(metrics.totalReveals).toBe(2);
      expect(metrics.totalCostStroops).toBeGreaterThan(0);
      expect(metrics.avgCostPerReveal).toBeGreaterThan(0);
      expect(metrics.totalCostXLM).toBe(metrics.totalCostStroops / 10_000_000);
    });

    it('should return empty metrics for period with no data', () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const metrics = service.getActualCosts(twoDaysAgo, oneDayAgo);

      expect(metrics.totalReveals).toBe(0);
      expect(metrics.totalCostStroops).toBe(0);
      expect(metrics.avgCostPerReveal).toBe(0);
    });

    it('should calculate correct breakdown by method', () => {
      service.recordRevealCost(1, 'PRNG', 200);
      service.recordRevealCost(2, 'PRNG', 250);
      service.recordRevealCost(3, 'VRF', 300);

      const metrics = service.getActualCosts(
        new Date(Date.now() - 1000),
        new Date(Date.now() + 1000),
      );

      expect(metrics.byMethod.prng.count).toBe(2);
      expect(metrics.byMethod.vrf.count).toBe(1);
      expect(metrics.byMethod.prng.totalCost).toBeGreaterThan(0);
      expect(metrics.byMethod.vrf.totalCost).toBeGreaterThan(0);
    });
  });

  describe('checkCostThresholds', () => {
    it('should generate alert when actual exceeds estimate significantly', async () => {
      feeEstimator.estimateFee.mockResolvedValue({
        baseFee: 100,
        priorityFee: 200,
        totalFee: 200,
        cappedFee: 200,
        isCapped: false,
      });

      const estimate = await service.estimateMonthlyCost(100, 70);

      // Record costs that are 3x the estimate
      for (let i = 0; i < 10; i++) {
        service.recordRevealCost(i, 'PRNG', estimate.avgCostPerReveal * 3);
      }

      const metrics = service.getActualCosts(
        new Date(Date.now() - 1000),
        new Date(),
      );

      const alerts = await service.checkCostThresholds(estimate, metrics);

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts.some((a) => a.type === 'COST_EXCEEDED')).toBe(true);
    });

    it('should not generate alert when costs are within threshold', async () => {
      feeEstimator.estimateFee.mockResolvedValue({
        baseFee: 100,
        priorityFee: 200,
        totalFee: 200,
        cappedFee: 200,
        isCapped: false,
      });

      const estimate = await service.estimateMonthlyCost(1000, 70); // 1000 reveals/month

      // Record only 1 reveal with cost below estimate
      // This ensures daily projection won't trigger budget warning
      service.recordRevealCost(1, 'PRNG', Math.floor(estimate.avgCostPerReveal * 0.5));

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const metrics = service.getActualCosts(
        oneDayAgo,
        new Date(),
      );

      const alerts = await service.checkCostThresholds(estimate, metrics);

      // Should not generate any alerts since:
      // 1. Cost per reveal is below estimate (no COST_EXCEEDED)
      // 2. Daily projection is low (no BUDGET_WARNING)
      expect(alerts.length).toBe(0);
    });

    it('should generate budget warning when projected to exceed monthly budget', async () => {
      feeEstimator.estimateFee.mockResolvedValue({
        baseFee: 100,
        priorityFee: 200,
        totalFee: 200,
        cappedFee: 200,
        isCapped: false,
      });

      const estimate = await service.estimateMonthlyCost(1000, 70);

      // Simulate high daily costs
      const highDailyCost = estimate.totalMonthlyCostStroops / 20; // 20 days worth in 1 day
      for (let i = 0; i < 50; i++) {
        service.recordRevealCost(i, 'PRNG', highDailyCost / 50);
      }

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const metrics = service.getActualCosts(oneDayAgo, new Date());

      const alerts = await service.checkCostThresholds(estimate, metrics);

      expect(alerts.some((a) => a.type === 'BUDGET_WARNING')).toBe(true);
    });
  });

  describe('getCostPerRevealMetric', () => {
    it('should return average cost of recent reveals', () => {
      service.recordRevealCost(1, 'PRNG', 200);
      service.recordRevealCost(2, 'VRF', 300);
      service.recordRevealCost(3, 'PRNG', 250);

      const metric = service.getCostPerRevealMetric();

      expect(metric).toBeGreaterThan(0);
      // Should be average of the recorded costs (including computational overhead)
    });

    it('should return 0 when no costs recorded', () => {
      const metric = service.getCostPerRevealMetric();
      expect(metric).toBe(0);
    });

    it('should only consider last 100 reveals', () => {
      // Record 150 reveals
      for (let i = 0; i < 150; i++) {
        service.recordRevealCost(i, 'PRNG', 200);
      }

      const metric = service.getCostPerRevealMetric();

      // Should only average the last 100
      expect(metric).toBeGreaterThan(0);
    });
  });

  describe('clearCostHistory', () => {
    it('should clear all recorded costs', () => {
      service.recordRevealCost(1, 'PRNG', 200);
      service.recordRevealCost(2, 'VRF', 300);

      service.clearCostHistory();

      const metrics = service.getActualCosts(
        new Date(Date.now() - 1000),
        new Date(),
      );

      expect(metrics.totalReveals).toBe(0);
      expect(service.getCostPerRevealMetric()).toBe(0);
    });
  });
});
