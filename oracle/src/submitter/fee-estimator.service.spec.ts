jest.mock('@stellar/stellar-sdk', () => ({
  rpc: {
    Server: jest.fn().mockImplementation(() => ({ getFeeStats: jest.fn() })),
  },
}));

import { ConfigService } from '@nestjs/config';
import { FeeEstimatorService, FeeStats } from './fee-estimator.service';
import { OracleLoggerService } from '../logger/oracle-logger';

function stats(p95: string): FeeStats {
  return {
    sorobanInclusionFee: {
      max: p95,
      min: '100',
      mode: '100',
      p50: '100',
      p90: p95,
      p95,
      p99: p95,
    },
    latestLedger: 1,
  };
}

describe('FeeEstimatorService', () => {
  let getFeeStats: jest.Mock;
  let service: FeeEstimatorService;

  beforeEach(() => {
    getFeeStats = jest.fn();
    service = new FeeEstimatorService(
      { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as OracleLoggerService,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
    );
    (service as any).rpcServer = { getFeeStats };
  });

  it('uses the p95 inclusion fee under normal network conditions', async () => {
    getFeeStats.mockResolvedValue(stats('200'));
    const estimate = await service.estimateFee(100);

    expect(estimate).toMatchObject({
      baseFee: 100,
      priorityFee: 200,
      totalFee: 200,
      cappedFee: 200,
      isCapped: false,
    });
  });

  it('caps a congested low-stakes raffle at 1 XLM', async () => {
    getFeeStats.mockResolvedValue(stats('3000000'));
    const estimate = await service.estimateFee(100);

    expect(estimate.priorityFee).toBe(3_000_000);
    expect(estimate.cappedFee).toBe(1_000_000);
    expect(estimate.isCapped).toBe(true);
  });

  it('keeps the full p95 fee for a high-stakes raffle under the configured cap', async () => {
    getFeeStats.mockResolvedValue(stats('3000000'));
    const estimate = await service.estimateFee(600);

    expect(estimate.cappedFee).toBe(3_000_000);
    expect(estimate.isCapped).toBe(false);
  });

  it('falls back to twice the base fee when fee stats are unavailable', async () => {
    getFeeStats.mockRejectedValue(new Error('rpc down'));
    const estimate = await service.estimateFee(100);

    expect(estimate).toMatchObject({ baseFee: 100, priorityFee: 200, cappedFee: 200, isCapped: false });
  });

  it('reuses cached fee stats inside the cache window', async () => {
    getFeeStats.mockResolvedValue(stats('200'));
    await service.estimateFee(100);
    await service.estimateFee(100);

    expect(getFeeStats).toHaveBeenCalledTimes(1);

    service.clearCache();
    await service.estimateFee(100);
    expect(getFeeStats).toHaveBeenCalledTimes(2);
  });
});
