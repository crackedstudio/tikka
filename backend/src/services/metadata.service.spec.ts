import { MetadataService } from './metadata.service';
import { SUPABASE_CLIENT } from './supabase.provider';

describe('MetadataService', () => {
  let service: MetadataService;
  let queryBuilder: {
    select: jest.Mock;
    or: jest.Mock;
    ilike: jest.Mock;
    limit: jest.Mock;
    upsert: jest.Mock;
  };
  let client: { from: jest.Mock };

  beforeEach(() => {
    queryBuilder = {
      select: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      upsert: jest.fn(),
    };

    client = {
      from: jest.fn().mockReturnValue(queryBuilder),
    };

    service = new MetadataService(client as any);
  });

  it('applies category filtering case-insensitively', async () => {
    queryBuilder.limit.mockResolvedValue({ data: [], error: null });

    await service.searchMetadata('raffle', 'Art');

    expect(queryBuilder.ilike).toHaveBeenCalledWith('category', 'Art');
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
});
