import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { IndexerError, IndexerService } from './indexer.service';

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
});

