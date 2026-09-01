import { Test, TestingModule } from '@nestjs/testing';
import { RafflesService } from './raffles.service';
import { IndexerService } from '../../../services/indexer/indexer.service';
import { MetadataService } from '../../../services/metadata.service';
import { PinningService } from '../../../services/pinning.service';
import { MetadataRedisService } from '../../../services/metadata-redis.service';
import { MetadataService } from '../../../services/metadata.service';
import { PinningService } from '../../../services/pinning.service';
import { ConfigService } from '@nestjs/config';

describe('RafflesService', () => {
  let service: RafflesService;
  let indexerService: jest.Mocked<IndexerService>;
  let redis: jest.Mocked<MetadataRedisService>;
  let configService: jest.Mocked<ConfigService>;
  let metadataService: jest.Mocked<MetadataService>;
  let pinningService: jest.Mocked<PinningService>;

  let metadataService: {
    getMetadata: jest.Mock;
    getMetadataWithArchived: jest.Mock;
  };

  beforeEach(async () => {
    indexerService = {
      getRaffle: jest.fn(),
      listRaffles: jest.fn(),
      getRaffleParticipants: jest.fn(),
    } as any;

    metadataService = {
      getMetadata: jest.fn().mockResolvedValue(null),
      getMetadataWithArchived: jest.fn().mockResolvedValue(null),
    };

    redis = {
      isEnabled: jest.fn(),
      get: jest.fn(),
      setEx: jest.fn(),
      del: jest.fn(),
    } as any;

    configService = {
      get: jest.fn(),
    } as any;

    metadataService = {
      getMetadata: jest.fn(),
      getBatchMetadata: jest.fn(),
      upsertMetadata: jest.fn(),
      updateMetadataCid: jest.fn(),
      softDeleteMetadata: jest.fn(),
      restoreMetadata: jest.fn(),
      getArchivedMetadata: jest.fn(),
    } as any;

    pinningService = {
      pin: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RafflesService,
        { provide: MetadataService, useValue: metadataService },
        { provide: IndexerService, useValue: indexerService },
        { provide: ConfigService, useValue: configService },
        { provide: PinningService, useValue: pinningService },
        { provide: MetadataRedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<RafflesService>(RafflesService);
  });

  describe('getById', () => {
    it('should return 200 with status for active open raffle', async () => {
      indexerService.getRaffle.mockResolvedValue({
        id: 1,
        creator: 'GABC123',
        status: 'open',
        ticket_price: '10',
        asset: 'XLM',
        max_tickets: 100,
        tickets_sold: 5,
        end_time: '1700000000',
        winner: null,
        prize_amount: null,
        created_ledger: 1000,
        finalized_ledger: null,
        metadata_cid: 'QmTest',
        created_at: '2026-01-01T00:00:00Z',
      });

      const result = await service.getById(1);
      expect(result.id).toBe(1);
      expect(result.status).toBe('open');
    });

    it('should return 200 with status for ended/finalized raffle', async () => {
      indexerService.getRaffle.mockResolvedValue({
        id: 2,
        creator: 'GABC123',
        status: 'finalized',
        ticket_price: '10',
        asset: 'XLM',
        max_tickets: 100,
        tickets_sold: 100,
        end_time: '1700000000',
        winner: 'GWINNER123',
        prize_amount: '1000',
        created_ledger: 1000,
        finalized_ledger: 1050,
        metadata_cid: 'QmTest',
        created_at: '2026-01-01T00:00:00Z',
      });

      const result = await service.getById(2);
      expect(result.id).toBe(2);
      expect(result.status).toBe('finalized');
      expect(result.winner).toBe('GWINNER123');
    });

    it('should return 200 with status for cancelled raffle', async () => {
      indexerService.getRaffle.mockResolvedValue({
        id: 3,
        creator: 'GABC123',
        status: 'cancelled',
        ticket_price: '10',
        asset: 'XLM',
        max_tickets: 100,
        tickets_sold: 2,
        end_time: '1700000000',
        winner: null,
        prize_amount: null,
        created_ledger: 1000,
        finalized_ledger: null,
        metadata_cid: null,
        created_at: '2026-01-01T00:00:00Z',
      });

      const result = await service.getById(3);
      expect(result.id).toBe(3);
      expect(result.status).toBe('cancelled');
    });

    it('should throw NotFoundException (404) for unknown raffle ID', async () => {
      indexerService.getRaffle.mockResolvedValue(null);
      metadataService.getMetadata.mockResolvedValue(null);
      metadataService.getMetadataWithArchived.mockResolvedValue(null);

      await expect(service.getById(999)).rejects.toThrow('Raffle 999 not found');
    });

    it('should throw GoneException (410) when metadata was soft-deleted', async () => {
      indexerService.getRaffle.mockResolvedValue(null);
      metadataService.getMetadata.mockResolvedValue(null);
      metadataService.getMetadataWithArchived.mockResolvedValue({
        raffle_id: 4,
        title: 'Deleted Raffle',
        description: 'Desc',
        image_url: null,
        image_urls: null,
        category: null,
        metadata_cid: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
        deleted_at: '2026-01-02T12:00:00Z',
      });

      await expect(service.getById(4)).rejects.toThrow('Raffle 4 has been deleted');
    });

    it('should throw GoneException (410) when indexer status is deleted', async () => {
      indexerService.getRaffle.mockResolvedValue({
        id: 5,
        creator: 'GABC123',
        status: 'deleted',
        ticket_price: '10',
        asset: 'XLM',
        max_tickets: 100,
        tickets_sold: 0,
        end_time: '1700000000',
        winner: null,
        prize_amount: null,
        created_ledger: 1000,
        finalized_ledger: null,
        metadata_cid: null,
        created_at: '2026-01-01T00:00:00Z',
      });

      await expect(service.getById(5)).rejects.toThrow('Raffle 5 has been deleted');
    });
  });

  describe('getParticipants', () => {
    it('should fetch participants from indexer when cache is disabled', async () => {
      const mockResponse = {
        participants: [
          { address: 'GABC123', tickets_count: 5, purchased_at: 1234567890 },
          { address: 'GDEF456', tickets_count: 3, purchased_at: 1234567895 },
        ],
        total: 2,
        limit: 20,
        offset: 0,
      };

      redis.isEnabled.mockReturnValue(false);
      indexerService.getRaffleParticipants.mockResolvedValue(mockResponse as any);

      const result = await service.getParticipants(1, 20, 0);

      expect(result).toEqual(mockResponse);
      expect(indexerService.getRaffleParticipants).toHaveBeenCalledWith(1, 20, 0);
      expect(redis.get).not.toHaveBeenCalled();
      expect(redis.setEx).not.toHaveBeenCalled();
    });

    it('should return cached participants when available', async () => {
      const cachedResponse = {
        participants: [{ address: 'GABC123', tickets_count: 5, purchased_at: 1234567890 }],
        total: 1,
        limit: 10,
        offset: 0,
      };

      redis.isEnabled.mockReturnValue(true);
      redis.get.mockResolvedValue(JSON.stringify(cachedResponse));

      const result = await service.getParticipants(1, 10, 0);

      expect(result).toEqual(cachedResponse);
      expect(redis.get).toHaveBeenCalledWith('raffle:1:participants:10:0');
      expect(indexerService.getRaffleParticipants).not.toHaveBeenCalled();
    });

    it('should fetch from indexer and cache when cache misses', async () => {
      const mockResponse = {
        participants: [{ address: 'GABC123', tickets_count: 5, purchased_at: 1234567890 }],
        total: 1,
        limit: 10,
        offset: 0,
      };

      redis.isEnabled.mockReturnValue(true);
      redis.get.mockResolvedValue(null);
      indexerService.getRaffleParticipants.mockResolvedValue(mockResponse as any);

      const result = await service.getParticipants(1, 10, 0);

      expect(result).toEqual(mockResponse);
      expect(indexerService.getRaffleParticipants).toHaveBeenCalledWith(1, 10, 0);
      expect(redis.get).toHaveBeenCalledWith('raffle:1:participants:10:0');
      expect(redis.setEx).toHaveBeenCalledWith('raffle:1:participants:10:0', 30, JSON.stringify(mockResponse));
    });

    it('should handle cache read errors gracefully', async () => {
      const mockResponse = {
        participants: [{ address: 'GABC123', tickets_count: 5, purchased_at: 1234567890 }],
        total: 1,
        limit: 10,
        offset: 0,
      };

      redis.isEnabled.mockReturnValue(true);
      redis.get.mockRejectedValue(new Error('Redis connection failed'));
      indexerService.getRaffleParticipants.mockResolvedValue(mockResponse as any);

      const result = await service.getParticipants(1, 10, 0);

      expect(result).toEqual(mockResponse);
      expect(indexerService.getRaffleParticipants).toHaveBeenCalled();
    });

    it('should handle cache write errors gracefully', async () => {
      const mockResponse = {
        participants: [{ address: 'GABC123', tickets_count: 5, purchased_at: 1234567890 }],
        total: 1,
        limit: 10,
        offset: 0,
      };

      redis.isEnabled.mockReturnValue(true);
      redis.get.mockResolvedValue(null);
      redis.setEx.mockRejectedValue(new Error('Redis write failed'));
      indexerService.getRaffleParticipants.mockResolvedValue(mockResponse as any);

      const result = await service.getParticipants(1, 10, 0);

      expect(result).toEqual(mockResponse);
      expect(indexerService.getRaffleParticipants).toHaveBeenCalled();
    });

    it('should enforce max limit of 100', async () => {
      const mockResponse = {
        participants: [],
        total: 0,
        limit: 100,
        offset: 0,
      };

      redis.isEnabled.mockReturnValue(false);
      indexerService.getRaffleParticipants.mockResolvedValue(mockResponse as any);

      await service.getParticipants(1, 150, 0);

      expect(indexerService.getRaffleParticipants).toHaveBeenCalledWith(1, 100, 0);
    });

    it('should use default values when limit and offset are not provided', async () => {
      const mockResponse = {
        participants: [],
        total: 0,
        limit: 20,
        offset: 0,
      };

      redis.isEnabled.mockReturnValue(false);
      indexerService.getRaffleParticipants.mockResolvedValue(mockResponse as any);

      await service.getParticipants(1);

      expect(indexerService.getRaffleParticipants).toHaveBeenCalledWith(1, 20, 0);
    });

    it('throws UnprocessableEntity when raffle is not open', async () => {
      const mockRaffle = { id: 1, status: 'finalized', creator: 'GABC123' };
      const payload = { quantity: 1 };
      configService.get.mockReturnValue(true);
      indexerService.getRaffle.mockResolvedValue(mockRaffle as any);

      await expect(
        service.purchaseTickets(1, payload, 'GABC123'),
      ).rejects.toThrow();
    });
  });
});