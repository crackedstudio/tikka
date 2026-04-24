import { SearchService } from './search.service';

describe('SearchService', () => {
  it('passes limit and offset to metadata search and returns paginated results with total', async () => {
    const metadataService = {
      searchMetadata: jest.fn().mockResolvedValue({
        matches: [
          {
            raffle_id: 2,
            title: 'Summer Raffle',
            description: 'A nice prize',
            image_url: null,
            category: 'seasonal',
          },
        ],
        total: 11,
      }),
    };

    const indexerService = {
      getRaffle: jest.fn().mockResolvedValue(null),
    };

    const service = new SearchService(
      metadataService as any,
      indexerService as any,
    );

    await expect((service as any).search('summer', 5, 10)).resolves.toEqual({
      raffles: [
        {
          id: 2,
          title: 'Summer Raffle',
          description: 'A nice prize',
          image_url: null,
          category: 'seasonal',
        },
      ],
      total: 11,
    });

    expect(metadataService.searchMetadata).toHaveBeenCalledWith('summer', 5, 10);
  });
});
