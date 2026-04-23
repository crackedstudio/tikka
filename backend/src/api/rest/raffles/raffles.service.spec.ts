import { NotFoundException } from '@nestjs/common';
import { RafflesService } from './raffles.service';
import { IndexerService, IndexerRaffleData } from '../../../services/indexer.service';
import { MetadataService, RaffleMetadata } from '../../../services/metadata.service';

const mockRaffle: IndexerRaffleData = {
  id: 1,
  creator: 'GABC123',
  status: 'open',
  ticket_price: '10',
  asset: 'XLM',
  max_tickets: 100,
  tickets_sold: 5,
  end_time: '2026-12-31T00:00:00Z',
  winner: null,
  prize_amount: null,
  created_ledger: 1000,
  finalized_ledger: null,
  metadata_cid: null,
  created_at: '2026-01-01T00:00:00Z',
};

const mockMetadata: RaffleMetadata = {
  raffle_id: 1,
  title: 'Test Raffle',
  description: 'A test raffle',
  image_url: 'https://example.com/img.png',
  category: 'art',
  metadata_cid: 'ipfs://abc',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('RafflesService', () => {
  let service: RafflesService;
  let indexerService: jest.Mocked<Pick<IndexerService, 'listRaffles' | 'getRaffle'>>;
  let metadataService: jest.Mocked<Pick<MetadataService, 'getMetadata' | 'getBatchMetadata' | 'upsertMetadata'>>;

  beforeEach(() => {
    indexerService = {
      listRaffles: jest.fn().mockResolvedValue({ raffles: [], total: 0 }),
      getRaffle: jest.fn().mockResolvedValue(null),
    };
    metadataService = {
      getMetadata: jest.fn().mockResolvedValue(null),
      getBatchMetadata: jest.fn().mockResolvedValue(new Map()),
      upsertMetadata: jest.fn(),
    };

    service = new RafflesService(
      metadataService as unknown as MetadataService,
      indexerService as unknown as IndexerService,
    );
  });

  describe('list', () => {
    it('delegates to indexerService.listRaffles with filters', async () => {
      const filters = { status: 'open', limit: 10, offset: 0 };
      indexerService.listRaffles.mockResolvedValue({ raffles: [mockRaffle], total: 1 });

      const result = await service.list(filters);

      expect(indexerService.listRaffles).toHaveBeenCalledWith(filters);
      expect(result).toEqual({ raffles: [mockRaffle], total: 1 });
    });

    it('calls listRaffles with empty filters by default', async () => {
      await service.list();

      expect(indexerService.listRaffles).toHaveBeenCalledWith({});
    });
  });

  describe('getById', () => {
    it('merges indexer data and metadata into a single response', async () => {
      indexerService.getRaffle.mockResolvedValue(mockRaffle);
      metadataService.getMetadata.mockResolvedValue(mockMetadata);

      const result = await service.getById(1);

      expect(result).toMatchObject({
        id: 1,
        creator: 'GABC123',
        status: 'open',
        title: 'Test Raffle',
        description: 'A test raffle',
        image_url: 'https://example.com/img.png',
        category: 'art',
        metadata_cid: 'ipfs://abc',
      });
    });

    it('returns indexer data when metadata is absent', async () => {
      indexerService.getRaffle.mockResolvedValue(mockRaffle);
      metadataService.getMetadata.mockResolvedValue(null);

      const result = await service.getById(1);

      expect(result.id).toBe(1);
      expect(result.creator).toBe('GABC123');
      expect(result.title).toBeUndefined();
    });

    it('returns metadata when indexer data is absent', async () => {
      indexerService.getRaffle.mockResolvedValue(null);
      metadataService.getMetadata.mockResolvedValue(mockMetadata);

      const result = await service.getById(1);

      expect(result.id).toBe(1);
      expect(result.title).toBe('Test Raffle');
      expect(result.creator).toBeUndefined();
    });

    it('throws NotFoundException when both indexer and metadata return null', async () => {
      indexerService.getRaffle.mockResolvedValue(null);
      metadataService.getMetadata.mockResolvedValue(null);

      await expect(service.getById(99)).rejects.toThrow(NotFoundException);
    });

    it('prefers metadata_cid from contract when both sources have it', async () => {
      const raffleWithCid = { ...mockRaffle, metadata_cid: 'ipfs://contract-cid' };
      indexerService.getRaffle.mockResolvedValue(raffleWithCid);
      metadataService.getMetadata.mockResolvedValue(mockMetadata);

      const result = await service.getById(1);

      expect(result.metadata_cid).toBe('ipfs://contract-cid');
    });

    it('falls back to metadata_cid from Supabase when contract has none', async () => {
      indexerService.getRaffle.mockResolvedValue(mockRaffle); // metadata_cid: null
      metadataService.getMetadata.mockResolvedValue(mockMetadata);

      const result = await service.getById(1);

      expect(result.metadata_cid).toBe('ipfs://abc');
    });
  });

  describe('getBatchMetadata', () => {
    it('returns array of metadata from the map', async () => {
      const map = new Map([[1, mockMetadata]]);
      metadataService.getBatchMetadata.mockResolvedValue(map);

      const result = await service.getBatchMetadata([1]);

      expect(result).toEqual([mockMetadata]);
      expect(metadataService.getBatchMetadata).toHaveBeenCalledWith([1]);
    });
  });

  describe('upsertMetadata', () => {
    it('delegates to metadataService.upsertMetadata', async () => {
      const payload = { title: 'New Title' };
      metadataService.upsertMetadata.mockResolvedValue({ ...mockMetadata, title: 'New Title' });

      await service.upsertMetadata(1, payload);

      expect(metadataService.upsertMetadata).toHaveBeenCalledWith(1, payload);
    });
  });
});
