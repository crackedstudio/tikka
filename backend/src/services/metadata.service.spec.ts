import { MetadataService } from './metadata.service';

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

    service = new MetadataService(client as any);
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
});
