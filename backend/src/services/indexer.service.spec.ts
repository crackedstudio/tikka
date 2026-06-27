import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { IndexerError, IndexerService } from './indexer.service';
import { requestIdStorage } from '../middleware/request-id.context';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware';

describe('IndexerService', () => {
  let service: IndexerService;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexerService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key === 'INDEXER_URL') return 'http://indexer.test';
              throw new Error(`unexpected key ${key}`);
            },
            get: (key: string, def?: number) =>
              key === 'INDEXER_TIMEOUT_MS' ? 50 : def,
          },
        },
      ],
    }).compile();
    service = module.get(IndexerService);

    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  it('returns null from getRaffle for 404 responses', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: jest.fn().mockResolvedValue('not found'),
      headers: { get: () => 'application/json' },
    });

    await expect(service.getRaffle(123)).resolves.toBeNull();
  });

  it('builds listRaffles query params correctly', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ raffles: [], total: 0 }),
      headers: { get: () => 'application/json' },
    });

    await service.listRaffles({
      status: 'open',
      creator: 'GABC',
      limit: 10,
      offset: 20,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://indexer.test/raffles?status=open&creator=GABC&limit=10&offset=20',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('maps AbortError to IndexerError timeout', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    fetchMock.mockRejectedValue(abortError);

    await expect(service.getPlatformStats()).rejects.toMatchObject({
      name: 'IndexerError',
      statusCode: 408,
    });
  });

  it('throws IndexerError with status code for non-2xx responses', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: jest.fn().mockResolvedValue('boom'),
      headers: { get: () => 'application/json' },
    });

    await expect(service.getLeaderboard()).rejects.toEqual(
      expect.objectContaining({
        name: 'IndexerError',
        statusCode: 500,
      }),
    );
  });

  it('builds leaderboard cursor and offset query params correctly', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ entries: [], nextCursor: null }),
      headers: { get: () => 'application/json' },
    });

    await service.getLeaderboard({
      by: 'wins',
      limit: 25,
      cursor: 'abc123',
      offset: 50,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://indexer.test/leaderboard?by=wins&limit=25&cursor=abc123&offset=50',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

describe('IndexerService — X-Request-Id forwarding', () => {
  let service: IndexerService;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexerService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key === 'INDEXER_URL') return 'http://indexer.test';
              throw new Error(`unexpected key ${key}`);
            },
            get: (key: string, def?: number) =>
              key === 'INDEXER_TIMEOUT_MS' ? 50 : def,
          },
        },
      ],
    }).compile();
    service = module.get(IndexerService);

    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ raffles: [], total: 0 }),
      headers: { get: () => 'application/json' },
    });
    (global as any).fetch = fetchMock;
  });

  it('forwards X-Request-Id when one is stored in AsyncLocalStorage', async () => {
    await requestIdStorage.run('test-req-id-123', () => service.listRaffles());

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ [REQUEST_ID_HEADER]: 'test-req-id-123' }),
      }),
    );
  });

  it('omits X-Request-Id when no ID is in AsyncLocalStorage', async () => {
    await service.listRaffles();

    const callArgs = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = callArgs.headers as Record<string, string> | undefined;
    expect(headers?.[REQUEST_ID_HEADER]).toBeUndefined();
  });

  it('preserves caller-supplied headers alongside X-Request-Id', async () => {
    await requestIdStorage.run('req-id-456', () =>
      service.submitLedger({ ledger: 1 }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          [REQUEST_ID_HEADER]: 'req-id-456',
        }),
      }),
    );
  });
});
