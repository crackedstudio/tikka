import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  CostEstimatorService,
  SubmissionCostEstimate,
} from '../submitter/cost-estimator.service';
import { AdminController } from './admin.controller';
import { AdminApiKeyGuard } from './admin-api-key.guard';

describe('AdminController', () => {
  let controller: AdminController;
  let costEstimator: jest.Mocked<Pick<CostEstimatorService, 'estimateSubmissionCost'>>;
  let nowSpy: jest.SpyInstance<number, []>;
  let currentTime: number;

  const sampleEstimate: SubmissionCostEstimate = {
    estimatedFeeXlm: '0.0000950',
    baseFee: 100,
    feeMultiplier: 9.5,
    surgeMultiplier: 9.5,
  };

  beforeEach(async () => {
    const mockCostEstimator = {
      estimateSubmissionCost: jest.fn().mockResolvedValue(sampleEstimate),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: CostEstimatorService,
          useValue: mockCostEstimator,
        },
      ],
    })
      // The guard is exercised in its own suite below.
      .overrideGuard(AdminApiKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminController>(AdminController);
    costEstimator = module.get(CostEstimatorService);

    // Control the clock so cache TTL behaviour is deterministic.
    currentTime = 1_000_000;
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => currentTime);
  });

  afterEach(() => {
    nowSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('GET /admin/cost-estimate', () => {
    it('returns the cost breakdown in XLM', async () => {
      const result = await controller.getCostEstimate();

      expect(result).toEqual({
        estimatedFeeXlm: '0.0000950',
        baseFee: 100,
        feeMultiplier: 9.5,
        surgeMultiplier: 9.5,
      });
      expect(costEstimator.estimateSubmissionCost).toHaveBeenCalledTimes(1);
    });

    it('serves a cached response within 30 seconds of the first call', async () => {
      const first = await controller.getCostEstimate();

      // Advance 29.999s — still inside the cache window.
      currentTime += 29_999;
      const second = await controller.getCostEstimate();

      expect(second).toEqual(first);
      // The underlying service is only consulted once.
      expect(costEstimator.estimateSubmissionCost).toHaveBeenCalledTimes(1);
    });

    it('recomputes the estimate once the 30 second cache expires', async () => {
      await controller.getCostEstimate();

      // Advance just past the 30s TTL.
      currentTime += 30_001;
      await controller.getCostEstimate();

      expect(costEstimator.estimateSubmissionCost).toHaveBeenCalledTimes(2);
    });

    it('reflects refreshed values after the cache expires', async () => {
      const refreshed: SubmissionCostEstimate = {
        estimatedFeeXlm: '0.0002000',
        baseFee: 100,
        feeMultiplier: 20,
        surgeMultiplier: 20,
      };
      costEstimator.estimateSubmissionCost
        .mockResolvedValueOnce(sampleEstimate)
        .mockResolvedValueOnce(refreshed);

      const first = await controller.getCostEstimate();
      currentTime += 30_001;
      const second = await controller.getCostEstimate();

      expect(first).toEqual(sampleEstimate);
      expect(second).toEqual(refreshed);
    });
  });
});

describe('AdminApiKeyGuard', () => {
  const buildGuard = (expectedKey?: string) => {
    const configService = {
      get: jest.fn((key: string) =>
        key === 'ORACLE_ADMIN_API_KEY' ? expectedKey : undefined,
      ),
    } as unknown as ConfigService;
    return new AdminApiKeyGuard(configService);
  };

  const contextWithHeader = (headers: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    }) as any;

  it('allows requests with the correct API key', () => {
    const guard = buildGuard('secret-key');
    expect(
      guard.canActivate(contextWithHeader({ 'x-api-key': 'secret-key' })),
    ).toBe(true);
  });

  it('rejects requests with an incorrect API key', () => {
    const guard = buildGuard('secret-key');
    expect(() =>
      guard.canActivate(contextWithHeader({ 'x-api-key': 'wrong-key' })),
    ).toThrow('Invalid admin API key');
  });

  it('rejects requests missing the API key header', () => {
    const guard = buildGuard('secret-key');
    expect(() => guard.canActivate(contextWithHeader({}))).toThrow(
      'Invalid admin API key',
    );
  });

  it('rejects all requests when no admin key is configured', () => {
    const guard = buildGuard(undefined);
    expect(() =>
      guard.canActivate(contextWithHeader({ 'x-api-key': 'anything' })),
    ).toThrow('Admin API is not configured');
  });
});
