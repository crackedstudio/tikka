import { SearchController } from './search.controller';
import { SearchService } from '../../../services/search.service';

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
      (controller as any).search({ q: 'rare', limit: 1, offset: 5 }),
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

    expect(searchService.search).toHaveBeenCalledWith('rare', 1, 5);
  });

  it('returns empty result when query is too short', async () => {
    const searchService = { search: jest.fn() };
    const controller = new SearchController(searchService as unknown as SearchService);

    await expect(
      (controller as any).search({ q: 'a' }),
    ).resolves.toEqual({ raffles: [], total: 0 });

    expect(searchService.search).not.toHaveBeenCalled();
  });
});
