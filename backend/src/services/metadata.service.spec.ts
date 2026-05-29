import { MetadataService, RaffleMetadata } from './metadata.service';
import { MetadataRedisService } from './metadata-redis.service';
import { MetadataCacheMetricsService } from './metadata-cache-metrics.service';

describe('MetadataService', () => {
  let service: MetadataService;
  let queryBuilder: {
    select: jest.Mock;
    textSearch: jest.Mock;
    range: jest.Mock;
    eq: jest.Mock;
    maybeSingle: jest.Mock;
    upsert: jest.Mock;
    in: jest.Mock;
  };
  let client: { from: jest.Mock };
  let redis: jest.Mocked<
    Pick<
      MetadataRedisService,
      'isEnabled' | 'get' | 'setEx' | 'del'
    >
  >;
  let metrics: MetadataCacheMetricsService;
  let config: { get: jest.Mock };

  beforeEach(() => {
    queryBuilder = {
      select: jest.fn().mockReturnThis(),
      textSearch: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      upsert: jest.fn(),
      in: jest.fn().mockReturnThis(),
    };

    client = {
      from: jest.fn().mockReturnValue(queryBuilder),
    };

    redis = {
      isEnabled: jest.fn().mockReturnValue(false),
      get: jest.fn().mockResolvedValue(null),
      setEx: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    metrics = new MetadataCacheMetricsService();

    config = {
      get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
    };

    service = new MetadataService(
      client as any,
      config as any,
      redis as unknown as MetadataRedisService,
      metrics,
    );
  });

  it('searches metadata using full-text search vector', async () => {
    await service.searchMetadata('raffle');

    expect(queryBuilder.textSearch).toHaveBeenCalledWith(
      'search_vector',
      'raffle',
      expect.objectContaining({
        config: 'english',
        type: 'websearch',
      }),
    );
  });

  it('trims category values before upserting metadata', async () => {
    const selectBuilder = {
      single: jest.fn().mockResolvedValue({
        data: { raffle_id: 1, category: 'Art' },
        error: null,
      }),
    };
    queryBuilder.upsert.mockReturnValue({
      select: jest.fn().mockReturnValue(selectBuilder),
    });

    await service.upsertMetadata(1, { category: '  Art  ' });

    expect(queryBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'Art' }),
      expect.any(Object),
    );
  });

  it('normalizes image_urls before upserting metadata', async () => {
    const selectBuilder = {
      single: jest.fn().mockResolvedValue({
        data: { raffle_id: 1, image_urls: ['https://a.com/x.png'] },
        error: null,
      }),
    };
    queryBuilder.upsert.mockReturnValue({
      select: jest.fn().mockReturnValue(selectBuilder),
    });

    await service.upsertMetadata(1, {
      image_urls: [' https://a.com/x.png ', '   ', ''],
    });

    expect(queryBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ image_urls: ['https://a.com/x.png'] }),
      expect.any(Object),
    );
  });

  it('returns metadata from Redis without querying Supabase on cache hit', async () => {
    redis.isEnabled.mockReturnValue(true);
    const cached: RaffleMetadata = {
      raffle_id: 7,
      title: 'Cached',
      description: 'd',
      image_url: null,
      image_urls: null,
      category: null,
      metadata_cid: null,
      created_at: '2020-01-01T00:00:00.000Z',
      updated_at: '2020-01-01T00:00:00.000Z',
    };
    redis.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.getMetadata(7);

    expect(result).toEqual(cached);
    expect(client.from).not.toHaveBeenCalled();
    expect(metrics.getMetadataCacheHits()).toBe(1);
  });

  it('populates Redis after Supabase read when cache is enabled', async () => {
    redis.isEnabled.mockReturnValue(true);
    config.get.mockImplementation((key: string, defaultValue?: unknown) => {
      if (key === 'METADATA_CACHE_TTL_SECONDS') {
        return 120;
      }
      return defaultValue;
    });

    const row: RaffleMetadata = {
      raffle_id: 3,
      title: 'From DB',
      description: 'd',
      image_url: null,
      image_urls: null,
      category: null,
      metadata_cid: null,
      created_at: '2020-01-01T00:00:00.000Z',
      updated_at: '2020-01-01T00:00:00.000Z',
    };
    queryBuilder.maybeSingle.mockResolvedValue({ data: row, error: null });

    const result = await service.getMetadata(3);

    expect(result).toEqual(row);
    expect(redis.setEx).toHaveBeenCalledWith(
      'tikka:raffle_metadata:3',
      120,
      JSON.stringify(row),
    );
    expect(metrics.getMetadataCacheHits()).toBe(0);
  });

  it('invalidates cache key after upsertMetadata', async () => {
    redis.isEnabled.mockReturnValue(true);
    const selectBuilder = {
      single: jest.fn().mockResolvedValue({
        data: { raffle_id: 9, title: 'x' },
        error: null,
      }),
    };
    queryBuilder.upsert.mockReturnValue({
      select: jest.fn().mockReturnValue(selectBuilder),
    });

    await service.upsertMetadata(9, { title: 'x' });

    expect(redis.del).toHaveBeenCalledWith('tikka:raffle_metadata:9');
  });
});
