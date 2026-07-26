import { ReplayService, ReplayJobConfig } from './replay.service';
import { ConfigService } from '@nestjs/config';

describe('ReplayService', () => {
  let service: ReplayService;
  let mockConfigService: any;
  let mockLock: any;
  let mockHorizonClient: any;
  let mockIndexer: any;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key, defaultVal) => {
        if (key === 'BACKFILL_MAX_RANGE') return 100;
        if (key === 'BACKFILL_RETRY_COUNT') return 1;
        if (key === 'BACKFILL_RETRY_DELAY_MS') return 0;
        return defaultVal;
      }),
    };

    mockLock = {
      tryAcquire: jest.fn().mockReturnValue(true),
      release: jest.fn(),
    };

    mockHorizonClient = {
      fetchLedger: jest.fn().mockResolvedValue({ id: 'ledger-xdr', sequence: 10 }),
    };

    mockIndexer = {
      submitLedger: jest.fn().mockResolvedValue(undefined),
    };

    service = new ReplayService(
      mockConfigService as unknown as ConfigService,
      mockLock as any,
      mockHorizonClient as any,
      mockIndexer as any,
    );
  });

  const waitForJob = async (jobId: string) => {
    for (let i = 0; i < 50; i++) {
      const status = service.getJobStatus(jobId);
      if (status && (status.status === 'completed' || status.status === 'failed')) {
        return status;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('Job did not complete in time');
  };

  it('runs a dry-run replay successfully without calling indexer', async () => {
    const config: ReplayJobConfig = {
      fromLedger: 10,
      toLedger: 12,
      dryRun: true,
    };

    const jobId = service.startReplay(config);
    expect(jobId).toBeDefined();

    const job = await waitForJob(jobId);
    expect(job.status).toBe('completed');
    expect(job.progress.processedCount).toBe(3);
    expect(job.progress.skippedCount).toBe(0);
    expect(mockIndexer.submitLedger).not.toHaveBeenCalled();

    expect(job.result).toBeDefined();
    expect(job.result?.fromLedger).toBe(10);
    expect(job.result?.toLedger).toBe(12);
    expect(job.result?.totalLedgers).toBe(3);
    expect(job.result?.processedCount).toBe(3);
    expect(job.result?.skippedCount).toBe(0);
    expect(job.result?.plannedActions).toEqual([
      { ledger: 10, action: 'submit', reason: 'Dry-run preview' },
      { ledger: 11, action: 'submit', reason: 'Dry-run preview' },
      { ledger: 12, action: 'submit', reason: 'Dry-run preview' },
    ]);
  });

  it('runs a confirmed mutating replay successfully and submits to indexer', async () => {
    const config: ReplayJobConfig = {
      fromLedger: 10,
      toLedger: 11,
      dryRun: false,
      confirmed: true,
    };

    const jobId = service.startReplay(config);
    const job = await waitForJob(jobId);

    expect(job.status).toBe('completed');
    expect(job.progress.processedCount).toBe(2);
    expect(mockIndexer.submitLedger).toHaveBeenCalledTimes(2);
    expect(job.result?.plannedActions).toEqual([
      { ledger: 10, action: 'submit', reason: 'Confirmed replay submission' },
      { ledger: 11, action: 'submit', reason: 'Confirmed replay submission' },
    ]);
  });

  it('throws an error if a mutating replay (dryRun=false) is started without confirmation', () => {
    const config: ReplayJobConfig = {
      fromLedger: 10,
      toLedger: 12,
      dryRun: false,
      confirmed: false,
    };

    expect(() => service.startReplay(config)).toThrow(
      "Mutating replay operations require explicit confirmation. Please set 'confirmed' to true.",
    );
  });

  it('throws an error if fromLedger is greater than toLedger', () => {
    const config: ReplayJobConfig = {
      fromLedger: 15,
      toLedger: 10,
      dryRun: true,
    };

    expect(() => service.startReplay(config)).toThrow(
      'fromLedger (15) must be <= toLedger (10)',
    );
  });

  it('throws an error if range exceeds BACKFILL_MAX_RANGE', () => {
    const config: ReplayJobConfig = {
      fromLedger: 1,
      toLedger: 150,
      dryRun: true,
    };

    expect(() => service.startReplay(config)).toThrow(
      'Range of 150 ledgers exceeds BACKFILL_MAX_RANGE (100)',
    );
  });

  it('handles and reports skipped/missing ledgers in the dry-run output', async () => {
    mockHorizonClient.fetchLedger.mockImplementation((seq: number) => {
      if (seq === 11) {
        throw new Error('Horizon connection reset');
      }
      return Promise.resolve({ id: `ledger-${seq}`, sequence: seq });
    });

    const config: ReplayJobConfig = {
      fromLedger: 10,
      toLedger: 12,
      dryRun: true,
    };

    const jobId = service.startReplay(config);
    const job = await waitForJob(jobId);

    expect(job.status).toBe('completed');
    expect(job.progress.processedCount).toBe(2);
    expect(job.progress.skippedCount).toBe(1);
    expect(job.result?.missingLedgers).toEqual([11]);
    expect(job.result?.plannedActions).toEqual([
      { ledger: 10, action: 'submit', reason: 'Dry-run preview' },
      { ledger: 11, action: 'skip', reason: 'Transient error after 2 attempt(s): Horizon connection reset' },
      { ledger: 12, action: 'submit', reason: 'Dry-run preview' },
    ]);
  });
});
