import { Test, TestingModule } from '@nestjs/testing';
import { SnapshotService, SnapshotWrapper, SnapshotManifest } from './snapshot.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RaffleEntity } from '../database/entities/raffle.entity';
import { TicketEntity } from '../database/entities/ticket.entity';
import { UserEntity } from '../database/entities/user.entity';
import { IndexerCursorEntity } from '../database/entities/indexer-cursor.entity';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as zlib from 'zlib';
import * as crypto from 'crypto';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);

describe('SnapshotService', () => {
  let service: SnapshotService;
  let dataSource: jest.Mocked<DataSource>;

  const mockRaffleRepo = { find: jest.fn() };
  const mockTicketRepo = { find: jest.fn() };
  const mockUserRepo = { find: jest.fn() };
  const mockCursorRepo = { findOne: jest.fn() };

  beforeEach(async () => {
    dataSource = {
      transaction: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SnapshotService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(RaffleEntity), useValue: mockRaffleRepo },
        { provide: getRepositoryToken(TicketEntity), useValue: mockTicketRepo },
        { provide: getRepositoryToken(UserEntity), useValue: mockUserRepo },
        { provide: getRepositoryToken(IndexerCursorEntity), useValue: mockCursorRepo },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              if (key === 'SNAPSHOT_STORAGE_URL') return 's3://test-bucket/snapshots';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SnapshotService>(SnapshotService);

    // Mock S3 upload/download
    (service as any).uploadToS3 = jest.fn();
    (service as any).downloadFromS3 = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should export snapshot and generate manifest', async () => {
    mockRaffleRepo.find.mockResolvedValue([{ id: 1 }]);
    mockTicketRepo.find.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    mockUserRepo.find.mockResolvedValue([]);
    mockCursorRepo.findOne.mockResolvedValue({ id: 1, lastLedger: 1000 });

    const filename = await service.exportSnapshot();

    expect(filename).toContain('snapshot-');
    expect((service as any).uploadToS3).toHaveBeenCalledTimes(1);

    const callArgs = (service as any).uploadToS3.mock.calls[0];
    expect(callArgs[0]).toBe(filename);

    const decompressed = zlib.gunzipSync(callArgs[1]);
    const wrapper: SnapshotWrapper = JSON.parse(decompressed.toString());

    expect(wrapper.manifest.schemaVersion).toBe('1.0.0');
    expect(wrapper.manifest.ledgerRange.min).toBe(0);
    expect(wrapper.manifest.ledgerRange.max).toBe(1000);
    expect(wrapper.manifest.entityCounts.raffles).toBe(1);
    expect(wrapper.manifest.entityCounts.tickets).toBe(2);
    expect(wrapper.manifest.entityCounts.users).toBe(0);

    const dataJson = JSON.stringify(wrapper.data);
    const checksum = crypto.createHash('sha256').update(dataJson).digest('hex');
    expect(wrapper.manifest.checksum).toBe(checksum);
  });

  it('should perform a dry-run import and validate manifest without db writes', async () => {
    const data = { raffles: [], tickets: [], users: [], cursor: null };
    const checksum = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const manifest: SnapshotManifest = {
      schemaVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      ledgerRange: { min: 0, max: 0 },
      entityCounts: { raffles: 0, tickets: 0, users: 0 },
      checksum,
    };
    const wrapper: SnapshotWrapper = { manifest, data };

    const compressed = await gzip(JSON.stringify(wrapper));
    (service as any).downloadFromS3.mockResolvedValue(compressed);

    const result = await service.importSnapshot('test.json.gz', true);

    expect(result.schemaVersion).toBe('1.0.0');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('should throw an error on schema mismatch', async () => {
    const wrapper = {
      manifest: {
        schemaVersion: '0.9.0',
        exportedAt: new Date().toISOString(),
        ledgerRange: { min: 0, max: 0 },
        entityCounts: { raffles: 0, tickets: 0, users: 0 },
        checksum: 'fake',
      },
      data: { raffles: [], tickets: [], users: [], cursor: null },
    };

    const compressed = await gzip(JSON.stringify(wrapper));
    (service as any).downloadFromS3.mockResolvedValue(compressed);

    await expect(service.importSnapshot('test.json.gz', true)).rejects.toThrow('Incompatible schema version');
  });

  it('should throw an error on checksum mismatch', async () => {
    const data = { raffles: [], tickets: [], users: [], cursor: null };
    const manifest: SnapshotManifest = {
      schemaVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      ledgerRange: { min: 0, max: 0 },
      entityCounts: { raffles: 0, tickets: 0, users: 0 },
      checksum: 'bad-checksum',
    };
    const wrapper: SnapshotWrapper = { manifest, data };

    const compressed = await gzip(JSON.stringify(wrapper));
    (service as any).downloadFromS3.mockResolvedValue(compressed);

    await expect(service.importSnapshot('test.json.gz', true)).rejects.toThrow('Checksum mismatch');
  });

  it('should throw an error on entity counts mismatch', async () => {
    const data = { raffles: [{ id: 1 } as any], tickets: [], users: [], cursor: null };
    const checksum = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const manifest: SnapshotManifest = {
      schemaVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      ledgerRange: { min: 0, max: 0 },
      entityCounts: { raffles: 0, tickets: 0, users: 0 }, // wrong count for raffles
      checksum,
    };
    const wrapper: SnapshotWrapper = { manifest, data };

    const compressed = await gzip(JSON.stringify(wrapper));
    (service as any).downloadFromS3.mockResolvedValue(compressed);

    await expect(service.importSnapshot('test.json.gz', true)).rejects.toThrow('Entity count mismatch');
  });

  it('should import snapshot successfully and call db transaction', async () => {
    const data = { raffles: [], tickets: [], users: [], cursor: null };
    const checksum = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const manifest: SnapshotManifest = {
      schemaVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      ledgerRange: { min: 0, max: 0 },
      entityCounts: { raffles: 0, tickets: 0, users: 0 },
      checksum,
    };
    const wrapper: SnapshotWrapper = { manifest, data };

    const compressed = await gzip(JSON.stringify(wrapper));
    (service as any).downloadFromS3.mockResolvedValue(compressed);
    dataSource.transaction.mockResolvedValue(undefined);

    const result = await service.importSnapshot('test.json.gz', false);

    expect(result).toBeDefined();
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });
});
