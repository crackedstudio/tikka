import { Test, TestingModule } from '@nestjs/testing';
import { RafflesService } from './raffles.service';
import { IndexerService } from '../../../services/indexer.service';
import { MetadataRedisService } from '../../../services/metadata-redis.service';
import { ConfigService } from '@nestjs/config';

describe('RafflesService', () => {
  let service: RafflesService;
  let indexerService: jest.Mocked<IndexerService>;
  let redis: jest.Mocked<MetadataRedisService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    indexerService = {
      getRaffle: jest.fn(),
      listRaffles: jest.fn(),
      getRaffleParticipants: jest.fn(),
    } as any;

    redis = {
      isEnabled: jest.fn(),
      get: jest.fn(),
      setEx: jest.fn(),
      del: jest.fn(),
    } as any;

    configService = {
      get: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RafflesService,
        { provide: IndexerService, useValue: indexerService },
        { provide: MetadataRedisService, useValue: redis },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<RafflesService>(RafflesService);
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
  });
});