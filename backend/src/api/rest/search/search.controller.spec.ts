import { SearchController } from './search.controller';
import { SearchService } from '../../../services/search.service';
import { SearchQuerySchema, SEARCH_QUERY_MAX_LENGTH, CATEGORY_MAX_LENGTH, STATUS_MAX_LENGTH } from './dto/search-query.dto';

describe('SearchController', () => {
  it('forwards q, limit, and offset and returns the service result', async () => {
    const searchService = {
      search: jest.fn().mockResolvedValue({
        raffles: [
          {
            id: 7,
            title: 'Rare Ticket',
            description: 'Prize',
            image_url: null,
            category: 'collectibles',
          },
        ],
        total: 13,
      }),
    };

    const controller = new SearchController(searchService as unknown as SearchService);

    await expect(
      controller.search({ q: 'rare', limit: 1, offset: 5 }),
    ).resolves.toEqual({
      raffles: [
        {
          id: 7,
          title: 'Rare Ticket',
          description: 'Prize',
          image_url: null,
          category: 'collectibles',
        },
      ],
      total: 13,
    });

    expect(searchService.search).toHaveBeenCalledWith({
      query: 'rare',
      limit: 1,
      offset: 5,
      category: undefined,
      status: undefined,
    });
  });

  it('returns empty result when query is too short', async () => {
    const searchService = { search: jest.fn() };
    const controller = new SearchController(searchService as unknown as SearchService);

    await expect(controller.search({ q: 'a' })).resolves.toEqual({
      raffles: [],
      total: 0,
    });

    expect(searchService.search).not.toHaveBeenCalled();
  });
});

describe('SearchQuerySchema validation', () => {
  describe('rejected inputs', () => {
    it('rejects unknown query parameters', () => {
      const result = SearchQuerySchema.safeParse({ q: 'test', unknownParam: 'value' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Unknown query parameter');
      }
    });

    it('rejects query exceeding max length', () => {
      const result = SearchQuerySchema.safeParse({ q: 'a'.repeat(SEARCH_QUERY_MAX_LENGTH + 1) });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('q');
        expect(result.error.errors[0].message).toContain('must not exceed');
      }
    });

    it('rejects category exceeding max length', () => {
      const result = SearchQuerySchema.safeParse({
        q: 'test',
        category: 'c'.repeat(CATEGORY_MAX_LENGTH + 1),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('category');
        expect(result.error.errors[0].message).toContain('must not exceed');
      }
    });

    it('rejects status exceeding max length', () => {
      const result = SearchQuerySchema.safeParse({
        q: 'test',
        status: 's'.repeat(STATUS_MAX_LENGTH + 1),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('status');
        expect(result.error.errors[0].message).toContain('must not exceed');
      }
    });
  });

  describe('valid inputs', () => {
    it('accepts minimum valid query', () => {
      const result = SearchQuerySchema.safeParse({ q: 'a' });
      expect(result.success).toBe(true);
    });

    it('accepts all valid sort values', () => {
      const sorts = ['relevance', 'ending_soon', 'price_asc', 'most_tickets'];
      for (const sort of sorts) {
        const result = SearchQuerySchema.safeParse({ q: 'test', sort });
        expect(result.success).toBe(true);
      }
    });

    it('coerces string limit and offset to numbers', () => {
      const result = SearchQuerySchema.safeParse({ q: 'test', limit: '10', offset: '5' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
        expect(result.data.offset).toBe(5);
      }
    });

    it('applies default limit and offset when omitted', () => {
      const result = SearchQuerySchema.safeParse({ q: 'test' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
        expect(result.data.offset).toBe(0);
      }
    });

    it('accepts optional category and status', () => {
      const result = SearchQuerySchema.safeParse({
        q: 'test',
        category: 'art',
        status: 'active',
      });
      expect(result.success).toBe(true);
    });
  });
});
