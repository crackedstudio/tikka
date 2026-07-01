import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ArchiveIntegrityStatusService } from './archive-integrity-status.service';
import {
  ArchiveCheckpointEntity,
  ArchiveJobStatus,
} from '../database/entities/archive-checkpoint.entity';
import { computeIntegrityHash } from '../maintenance/archive-raffle-events';

function makeCheckpoint(overrides: Partial<ArchiveCheckpointEntity> = {}): ArchiveCheckpointEntity {
  const cp = new ArchiveCheckpointEntity();
  cp.id = overrides.id ?? 'cp-1';
  cp.jobType = overrides.jobType ?? 'raffle_events';
  cp.lastProcessedTimestamp = overrides.lastProcessedTimestamp ?? null;
  cp.lastProcessedId = overrides.lastProcessedId ?? null;
  cp.totalArchived = overrides.totalArchived ?? 0;
  cp.batchNumber = overrides.batchNumber ?? 0;
  cp.status = overrides.status ?? ArchiveJobStatus.IN_PROGRESS;
  cp.configSnapshot = overrides.configSnapshot ?? {
    retentionDays: 30,
    batchSize: 500,
    cutoffDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
  cp.startedAt = overrides.startedAt ?? new Date();
  cp.updatedAt = overrides.updatedAt ?? new Date();
  cp.completedAt = overrides.completedAt ?? null;
  cp.integrityHash = overrides.integrityHash ?? null;
  cp.lastVerifiedAt = overrides.lastVerifiedAt ?? null;
  cp.verificationFailureReason = overrides.verificationFailureReason ?? null;
  return cp;
}

function makeDataSourceMock(row: ArchiveCheckpointEntity | null) {
  const findOne = jest.fn().mockResolvedValue(row);
  return {
    isInitialized: true,
    query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    getRepository: jest.fn().mockReturnValue({ findOne }),
  };
}

describe('ArchiveIntegrityStatusService', () => {
  let service: ArchiveIntegrityStatusService;
  let dataSource: ReturnType<typeof makeDataSourceMock>;

  async function build(row: ArchiveCheckpointEntity | null) {
    dataSource = makeDataSourceMock(row) as any;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArchiveIntegrityStatusService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get<ArchiveIntegrityStatusService>(
      ArchiveIntegrityStatusService,
    );
  }

  afterEach(() => jest.restoreAllMocks());

  it('returns no_checkpoint when there is no checkpoint row', async () => {
    await build(null);
    const result = await service.getStatus();

    expect(result.archive_integrity).toBe('no_checkpoint');
    expect(result.last_verified_at).toBeNull();
    expect(result.checkpoint_id).toBeNull();
    expect(result.failure_reason).toBeNull();
    expect(result.job_type).toBeNull();
  });

  it('returns ok when checkpoint has matching integrity hash', async () => {
    const cp = makeCheckpoint();
    cp.batchNumber = 5;
    cp.totalArchived = 100;
    cp.integrityHash = computeIntegrityHash(cp);
    cp.lastVerifiedAt = new Date();

    await build(cp);
    const result = await service.getStatus();

    expect(result.archive_integrity).toBe('ok');
    expect(result.checkpoint_id).toBe(cp.id);
    expect(result.job_type).toBe('raffle_events');
    expect(result.failure_reason).toBeNull();
  });

  it('returns ok for a legacy checkpoint without integrity hash (graceful migration)', async () => {
    const cp = makeCheckpoint();
    cp.integrityHash = null; // legacy state

    await build(cp);
    const result = await service.getStatus();

    expect(result.archive_integrity).toBe('ok');
  });

  it('returns failed when status is FAILED', async () => {
    const cp = makeCheckpoint();
    cp.status = ArchiveJobStatus.FAILED;
    cp.verificationFailureReason = 'Integrity hash mismatch detected on resume';
    cp.lastVerifiedAt = new Date();

    await build(cp);
    const result = await service.getStatus();

    expect(result.archive_integrity).toBe('failed');
    expect(result.failure_reason).toBe('Integrity hash mismatch detected on resume');
    expect(result.last_verified_at).not.toBeNull();
  });

  it('returns failed when stored hash no longer matches current row state', async () => {
    const cp = makeCheckpoint();
    cp.batchNumber = 7;
    cp.totalArchived = 200;
    cp.integrityHash = computeIntegrityHash(cp);
    // Now mutate the checkpoint's state without updating the hash.
    cp.batchNumber = 8;
    cp.totalArchived = 250;

    await build(cp);
    const result = await service.getStatus();

    expect(result.archive_integrity).toBe('failed');
    expect(result.failure_reason).toMatch(/matches|no longer/);
  });

  it('returns failed when the data source is uninitialized', async () => {
    dataSource = makeDataSourceMock(null) as any;
    dataSource.isInitialized = false;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArchiveIntegrityStatusService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get<ArchiveIntegrityStatusService>(
      ArchiveIntegrityStatusService,
    );

    const result = await service.getStatus();

    expect(result.archive_integrity).toBe('failed');
    expect(result.failure_reason).toMatch(/not initialized/i);
  });

  it('returns failed when querying the repository throws', async () => {
    const throwingDataSource = {
      isInitialized: true,
      query: jest.fn(),
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockRejectedValue(new Error('connection refused')),
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArchiveIntegrityStatusService,
        { provide: DataSource, useValue: throwingDataSource },
      ],
    }).compile();
    service = module.get<ArchiveIntegrityStatusService>(
      ArchiveIntegrityStatusService,
    );

    const result = await service.getStatus();

    expect(result.archive_integrity).toBe('failed');
    expect(result.failure_reason).toMatch(/connection refused/);
  });
});
