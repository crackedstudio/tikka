import { SearchController } from './search.controller';

describe('SearchController', () => {
  it('forwards q, limit, and offset and returns the service total', async () => {
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

    const controller = new SearchController(searchService as any);

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
});
