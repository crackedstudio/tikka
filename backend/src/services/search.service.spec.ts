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

    await expect((service as any).search({ query: 'summer', limit: 5, offset: 10 })).resolves.toEqual({
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

    expect(metadataService.searchMetadata).toHaveBeenCalledWith({
      query: 'summer',
      limit: 5,
      offset: 10,
      category: undefined,
    });
  });
});

describe('SearchService — relevance ranking', () => {
  function buildService() {
    const metadataService = { searchMetadata: jest.fn() };
    const indexerService = { getRaffle: jest.fn() };
    return {
      service: new SearchService(metadataService as any, indexerService as any),
      metadataService,
      indexerService,
    };
  }

  it('ranks a recently-created active raffle above an older inactive one', async () => {
    const { service, metadataService, indexerService } = buildService();

    metadataService.searchMetadata.mockResolvedValue({
      matches: [
        { raffle_id: 1, title: 'Old Raffle', description: '', image_url: null, category: null },
        { raffle_id: 2, title: 'New Raffle', description: '', image_url: null, category: null },
      ],
      total: 2,
    });

    const nowIso = new Date().toISOString();
    const oldIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ago

    indexerService.getRaffle
      .mockResolvedValueOnce({
        // raffle_id 1 — old, inactive, sold out
        creator: 'GCREATOR',
        status: 'ended',
        ticket_price: '100',
        asset: 'XLM',
        max_tickets: 50,
        tickets_sold: 50,
        end_time: oldIso,
        winner: null,
        prize_amount: null,
        created_ledger: 1,
        finalized_ledger: null,
        metadata_cid: null,
        created_at: oldIso,
      })
      .mockResolvedValueOnce({
        // raffle_id 2 — new, active, tickets available
        creator: 'GCREATOR',
        status: 'active',
        ticket_price: '100',
        asset: 'XLM',
        max_tickets: 100,
        tickets_sold: 10,
        end_time: nowIso,
        winner: null,
        prize_amount: null,
        created_ledger: 2,
        finalized_ledger: null,
        metadata_cid: null,
        created_at: nowIso,
      });

    const result = await service.search({ query: 'raffle', sort: 'relevance' });

    expect(result.raffles).toHaveLength(2);
    // New active raffle (id 2) must score higher than old ended raffle (id 1)
    expect(result.raffles[0].id).toBe(2);
    expect(result.raffles[0].score).toBeGreaterThan(result.raffles[1].score);
  });
});
