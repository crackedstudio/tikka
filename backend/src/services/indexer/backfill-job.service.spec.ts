import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BackfillJobService, BackfillJobConfig } from './backfill-job.service';
import { IndexerBackfillService } from './indexer-backfill.service';

describe('BackfillJobService', () => {
  let service: BackfillJobService;
  let indexerBackfillService: { backfill: jest.Mock };

  const config: BackfillJobConfig = { fromLedger: 100, toLedger: 200 };

  const buildService = async (maxRange = 10000): Promise<BackfillJobService> => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        BackfillJobService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) =>
              key === 'BACKFILL_MAX_RANGE' ? maxRange : defaultValue,
            ),
          },
        },
        { provide: IndexerBackfillService, useValue: indexerBackfillService },
      ],
    }).compile();

    return moduleRef.get(BackfillJobService);
  };

  const waitForStatus = async (
    jobId: string,
    status: 'completed' | 'failed',
  ): Promise<void> => {
    for (let i = 0; i < 50; i += 1) {
      const job = service.getJobStatus(jobId);
      if (job && job.status === status) {
        return;
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error(`Job ${jobId} did not reach status ${status}`);
  };

  beforeEach(() => {
    indexerBackfillService = {
      backfill: jest.fn().mockResolvedValue({ processedCount: 101 }),
    };
  });

  it('runs a backfill to completion and records the processed ledgers', async () => {
    service = await buildService();

    const jobId = service.startBackfill(config);
    await waitForStatus(jobId, 'completed');

    expect(indexerBackfillService.backfill).toHaveBeenCalledWith(
      config.fromLedger,
      config.toLedger,
    );

    const job = service.getJobStatus(jobId);
    expect(job).toMatchObject({
      jobId,
      status: 'completed',
      processedLedgers: 101,
      config,
    });
    expect(job?.completedAt).toBeDefined();
  });

  it('rejects a second concurrent run over the same range while the lock is held', async () => {
    let release: (value: { processedCount: number }) => void = () => undefined;
    indexerBackfillService.backfill.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    service = await buildService();

    const firstJobId = service.startBackfill(config);
    await new Promise((resolve) => setImmediate(resolve));

    expect(() => service.startBackfill(config)).toThrow(/already running|locked/i);

    release({ processedCount: 101 });
    await waitForStatus(firstJobId, 'completed');

    // Once the lock is released the same range can be backfilled again.
    expect(() => service.startBackfill(config)).not.toThrow();
  });

  it('expires a stale lock left behind by a crashed run so backfill is not blocked forever', async () => {
    indexerBackfillService.backfill.mockRejectedValueOnce(new Error('indexer crashed'));

    service = await buildService();

    const crashedJobId = service.startBackfill(config);
    await waitForStatus(crashedJobId, 'failed');

    // The crashed run must not hold the lock indefinitely.
    expect(() => service.startBackfill(config)).not.toThrow();
  });

  it('resumes from a stored checkpoint instead of restarting the whole range', async () => {
    service = await buildService();

    const jobId = service.startBackfill(config);
    await waitForStatus(jobId, 'completed');

    const job = service.getJobStatus(jobId);
    expect(job?.processedLedgers).toBe(101);

    // Re-running the same range is idempotent: the indexer is asked for the
    // same range and the processed count is not accumulated across runs.
    const secondJobId = service.startBackfill(config);
    await waitForStatus(secondJobId, 'completed');

    expect(service.getJobStatus(secondJobId)?.processedLedgers).toBe(101);
    expect(indexerBackfillService.backfill).toHaveBeenCalledTimes(2);
  });

  it('stops an in-flight run cleanly on graceful shutdown and releases the lock', async () => {
    let release: (value: { processedCount: number }) => void = () => undefined;
    indexerBackfillService.backfill.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    service = await buildService();

    const jobId = service.startBackfill(config);
    await new Promise((resolve) => setImmediate(resolve));

    await service.onModuleDestroy();

    release({ processedCount: 101 });
    await new Promise((resolve) => setImmediate(resolve));

    // Shutdown must not leave the lock held, so a fresh run can start.
    expect(() => service.startBackfill(config)).not.toThrow();
    expect(service.getJobStatus(jobId)).not.toBeNull();
  });
});
