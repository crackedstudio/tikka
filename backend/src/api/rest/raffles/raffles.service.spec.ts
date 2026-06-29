import { ForbiddenException, NotFoundException, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RafflesService } from './raffles.service';
import { IndexerService, IndexerRaffleData } from '../../../services/indexer.service';
import { MetadataService, RaffleMetadata } from '../../../services/metadata.service';
import { PinningService } from '../../../services/pinning.service';

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
  image_urls: ['https://example.com/img.png'],
  category: 'art',
  metadata_cid: 'ipfs://abc',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
};

describe('RafflesService', () => {
  let service: RafflesService;
  let indexerService: jest.Mocked<Pick<IndexerService, 'listRaffles' | 'getRaffle'>>;
  let metadataService: jest.Mocked<Pick<MetadataService, 'getMetadata' | 'getBatchMetadata' | 'upsertMetadata' | 'updateMetadataCid'>>;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;
  let pinningService: jest.Mocked<Pick<PinningService, 'pin'>>;

  beforeEach(() => {
    indexerService = {
      listRaffles: jest.fn().mockResolvedValue({ raffles: [], total: 0 }),
      getRaffle: jest.fn().mockResolvedValue(null),
    };
    metadataService = {
      getMetadata: jest.fn().mockResolvedValue(null),
      getBatchMetadata: jest.fn().mockResolvedValue(new Map()),
      upsertMetadata: jest.fn(),
      updateMetadataCid: jest.fn(),
    };
    configService = {
      get: jest.fn().mockReturnValue(false),
    };
    pinningService = {
      pin: jest.fn().mockResolvedValue(null),
    };

    service = new RafflesService(
      metadataService as unknown as MetadataService,
      indexerService as unknown as IndexerService,
      configService as unknown as ConfigService,
      pinningService as unknown as PinningService,
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
    it('delegates to metadataService.upsertMetadata, pins, and updates metadata_cid on success', async () => {
      const payload = { title: 'New Title' };
      indexerService.getRaffle.mockResolvedValue(mockRaffle);
      metadataService.upsertMetadata.mockResolvedValue({ ...mockMetadata, title: 'New Title' });
      pinningService.pin.mockResolvedValue('QmPinnedIpfsHash');
      metadataService.updateMetadataCid.mockResolvedValue({
        ...mockMetadata,
        title: 'New Title',
        metadata_cid: 'QmPinnedIpfsHash',
      });

      const result = await service.upsertMetadata(1, payload, 'GABC123');

      expect(metadataService.upsertMetadata).toHaveBeenCalledWith(1, payload);
      expect(pinningService.pin).toHaveBeenCalledWith({ ...mockMetadata, title: 'New Title' });
      expect(metadataService.updateMetadataCid).toHaveBeenCalledWith(1, 'QmPinnedIpfsHash');
      expect(result.metadata_cid).toBe('QmPinnedIpfsHash');
    });

    it('continues gracefully if PinningService.pin returns null', async () => {
      const payload = { title: 'New Title' };
      indexerService.getRaffle.mockResolvedValue(mockRaffle);
      metadataService.upsertMetadata.mockResolvedValue({ ...mockMetadata, title: 'New Title', metadata_cid: null });
      pinningService.pin.mockResolvedValue(null);

      const result = await service.upsertMetadata(1, payload, 'GABC123');

      expect(metadataService.upsertMetadata).toHaveBeenCalledWith(1, payload);
      expect(pinningService.pin).toHaveBeenCalled();
      expect(metadataService.updateMetadataCid).not.toHaveBeenCalled();
      expect(result.metadata_cid).toBeNull();
    });

    it('continues gracefully if PinningService.pin throws an error', async () => {
      const payload = { title: 'New Title' };
      indexerService.getRaffle.mockResolvedValue(mockRaffle);
      metadataService.upsertMetadata.mockResolvedValue({ ...mockMetadata, title: 'New Title', metadata_cid: null });
      pinningService.pin.mockRejectedValue(new Error('Pinata API offline'));

      const result = await service.upsertMetadata(1, payload, 'GABC123');

      expect(metadataService.upsertMetadata).toHaveBeenCalledWith(1, payload);
      expect(pinningService.pin).toHaveBeenCalled();
      expect(metadataService.updateMetadataCid).not.toHaveBeenCalled();
      expect(result.metadata_cid).toBeNull();
    });

    it('throws NotFoundException when raffle is missing in indexer', async () => {
      indexerService.getRaffle.mockResolvedValue(null);

      await expect(
        service.upsertMetadata(99, { title: 'Nope' }, 'GABC123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when requester is not raffle creator', async () => {
      indexerService.getRaffle.mockResolvedValue(mockRaffle);

      await expect(
        service.upsertMetadata(1, { title: 'Nope' }, 'GOTHER999'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('purchaseTickets', () => {
    const payload = { quantity: 2 };

    it('throws NotImplementedException when feature flag is disabled', async () => {
      configService.get.mockReturnValue(false);

      await expect(
        service.purchaseTickets(1, payload, 'GABC123'),
      ).rejects.toThrow(NotImplementedException);

      expect(indexerService.getRaffle).not.toHaveBeenCalled();
    });

    it('throws NotImplementedException when feature flag is enabled but integration is pending', async () => {
      configService.get.mockReturnValue(true);
      indexerService.getRaffle.mockResolvedValue(mockRaffle);

      await expect(
        service.purchaseTickets(1, payload, 'GABC123'),
      ).rejects.toThrow(NotImplementedException);

      expect(indexerService.getRaffle).toHaveBeenCalledWith(1);
    });

    it('throws NotFoundException when raffle does not exist and feature flag is enabled', async () => {
      configService.get.mockReturnValue(true);
      indexerService.getRaffle.mockResolvedValue(null);

      await expect(
        service.purchaseTickets(99, payload, 'GABC123'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
