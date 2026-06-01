import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FeeEstimatorService, FeeUnsafeError } from './fee-estimator.service';

/** Build a ConfigService stub with optional overrides. */
function makeConfig(overrides: Record<string, string> = {}) {
  return {
    get: jest.fn((key: string) => overrides[key] ?? undefined),
  };
}

/** Build a mock RPC server whose getFeeStats resolves to a valid response. */
function mockRpcWith(p95: string) {
  return {
    getFeeStats: jest.fn().mockResolvedValue({
      sorobanInclusionFee: { max: '5000', min: '100', mode: '200', p50: '150', p90: '300', p95, p99: '1000' },
      latestLedger: 1,
    }),
  };
}

describe('FeeEstimatorService', () => {
  let service: FeeEstimatorService;

  async function build(configOverrides: Record<string, string> = {}) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeeEstimatorService,
        { provide: ConfigService, useValue: makeConfig(configOverrides) },
      ],
    }).compile();
    return module.get<FeeEstimatorService>(FeeEstimatorService);
  }

  beforeEach(async () => {
    service = await build();
  });

  describe('normal estimate (network available)', () => {
    it('returns source=network and confidence=high on fresh fetch', async () => {
      (service as any).rpcServer = mockRpcWith('500');

      const result = await service.estimateFee();

      expect(result.source).toBe('network');
      expect(result.confidence).toBe('high');
      expect(result.priorityFee).toBe(500);
      expect(result.cappedFee).toBeLessThanOrEqual(result.totalFee);
    });

    it('returns source=cache on second call within TTL', async () => {
      const rpc = mockRpcWith('500');
      (service as any).rpcServer = rpc;

      await service.estimateFee();
      const second = await service.estimateFee();

      expect(second.source).toBe('cache');
      expect(rpc.getFeeStats).toHaveBeenCalledTimes(1);
    });

    it('re-fetches after cache TTL expires', async () => {
      const rpc = mockRpcWith('500');
      (service as any).rpcServer = rpc;

      await service.estimateFee();
      // Expire the cache
      (service as any).lastFetchTime = 0;
      const second = await service.estimateFee();

      expect(second.source).toBe('network');
      expect(rpc.getFeeStats).toHaveBeenCalledTimes(2);
    });
  });

  describe('provider failure (fallback)', () => {
    it('returns source=fallback and confidence=low when RPC throws', async () => {
      (service as any).rpcServer = {
        getFeeStats: jest.fn().mockRejectedValue(new Error('network error')),
      };

      const result = await service.estimateFee();

      expect(result.source).toBe('fallback');
      expect(result.confidence).toBe('low');
      expect(result.cappedFee).toBeGreaterThan(0);
    });

    it('returns source=fallback when RPC returns invalid response', async () => {
      (service as any).rpcServer = {
        getFeeStats: jest.fn().mockResolvedValue({ unexpected: true }),
      };

      const result = await service.estimateFee();

      expect(result.source).toBe('fallback');
      expect(result.confidence).toBe('low');
    });

    it('fallback fee is 2x base fee (200 stroops)', async () => {
      (service as any).rpcServer = {
        getFeeStats: jest.fn().mockRejectedValue(new Error('down')),
      };

      const result = await service.estimateFee();

      expect(result.cappedFee).toBe(200);
    });
  });

  describe('above-max fee', () => {
    it('throws FeeUnsafeError(above_max) when network p95 exceeds MAX_FEE_CAP_STROOPS', async () => {
      // Set a very low max cap so the network fee exceeds it
      service = await build({ ORACLE_MAX_FEE_STROOPS: '50', ORACLE_MIN_FEE_STROOPS: '10' });
      (service as any).rpcServer = mockRpcWith('500'); // p95=500 > cap=50

      await expect(service.estimateFee()).rejects.toThrow(FeeUnsafeError);
      await expect(service.estimateFee()).rejects.toMatchObject({ reason: 'above_max' });
    });

    it('FeeUnsafeError carries fee and bound values', async () => {
      service = await build({ ORACLE_MAX_FEE_STROOPS: '50', ORACLE_MIN_FEE_STROOPS: '10' });
      (service as any).rpcServer = mockRpcWith('500');

      try {
        await service.estimateFee();
        throw new Error('expected FeeUnsafeError');
      } catch (e) {
        expect(e).toBeInstanceOf(FeeUnsafeError);
        const err = e as FeeUnsafeError;
        expect(err.reason).toBe('above_max');
        expect(err.bound).toBe(50);
        expect(err.fee).toBe(500); // totalFee (p95) before capping
      }
    });
  });

  describe('below-min fee', () => {
    it('throws FeeUnsafeError(below_min) when cappedFee is below MIN_FEE_STROOPS', async () => {
      // Set a very high min so the fallback fee (200) is below it
      service = await build({ ORACLE_MIN_FEE_STROOPS: '1000' });
      (service as any).rpcServer = {
        getFeeStats: jest.fn().mockRejectedValue(new Error('down')),
      };

      await expect(service.estimateFee()).rejects.toThrow(FeeUnsafeError);
      await expect(service.estimateFee()).rejects.toMatchObject({ reason: 'below_min' });
    });

    it('throws FeeUnsafeError(below_min) when network p95 is below MIN_FEE_STROOPS', async () => {
      service = await build({ ORACLE_MIN_FEE_STROOPS: '1000' });
      (service as any).rpcServer = mockRpcWith('50'); // p95=50 < min=1000

      await expect(service.estimateFee()).rejects.toThrow(FeeUnsafeError);
      await expect(service.estimateFee()).rejects.toMatchObject({ reason: 'below_min' });
    });
  });

  describe('FeeUnsafeError', () => {
    it('has correct name and message for below_min', () => {
      const err = new FeeUnsafeError('below_min', 50, 100);
      expect(err.name).toBe('FeeUnsafeError');
      expect(err.message).toContain('below minimum');
      expect(err.fee).toBe(50);
      expect(err.bound).toBe(100);
    });

    it('has correct name and message for above_max', () => {
      const err = new FeeUnsafeError('above_max', 500, 100);
      expect(err.name).toBe('FeeUnsafeError');
      expect(err.message).toContain('exceeds maximum');
      expect(err.fee).toBe(500);
      expect(err.bound).toBe(100);
    });
  });

  describe('clearCache', () => {
    it('forces a fresh network fetch on next call', async () => {
      const rpc = mockRpcWith('300');
      (service as any).rpcServer = rpc;

      await service.estimateFee();
      service.clearCache();
      const result = await service.estimateFee();

      expect(result.source).toBe('network');
      expect(rpc.getFeeStats).toHaveBeenCalledTimes(2);
    });
  });
});
