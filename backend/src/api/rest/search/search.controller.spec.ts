import { SearchController } from './search.controller';
import { SearchService } from '../../../services/search.service';

describe('SearchController', () => {
  let controller: SearchController;
  let searchService: { search: jest.Mock };

  beforeEach(() => {
    searchService = {
      search: jest.fn(),
    };

    controller = new SearchController(searchService as unknown as SearchService);
  });

  it('passes a trimmed category filter to the search service', async () => {
    searchService.search.mockResolvedValue([]);

    await controller.search('raffle', '  Art  ');

    expect(searchService.search).toHaveBeenCalledWith('raffle', 'Art');
  });

  it('treats an empty category as no filter', async () => {
    searchService.search.mockResolvedValue([]);

    await controller.search('raffle', '   ');

    expect(searchService.search).toHaveBeenCalledWith('raffle', undefined);

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
