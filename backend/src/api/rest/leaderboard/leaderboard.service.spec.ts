import { LeaderboardService, LEADERBOARD_CACHE_TTL } from './leaderboard.service';
import { IndexerService, IndexerLeaderboardResponse } from '../../../services/indexer.service';
import { MetadataRedisService } from '../../../services/metadata-redis.service';

const mockData: IndexerLeaderboardResponse = {
  entries: [{ address: 'GABC', total_wins: 5, total_volume_xlm: '100', total_tickets: 10 }],
};

describe('LeaderboardService', () => {
  let service: LeaderboardService;
  let indexer: jest.Mocked<Pick<IndexerService, 'getLeaderboard'>>;
  let redis: jest.Mocked<Pick<MetadataRedisService, 'get' | 'setEx' | 'del' | 'sAdd' | 'sMembers'>>;

  beforeEach(() => {
    indexer = { getLeaderboard: jest.fn().mockResolvedValue(mockData) };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      setEx: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      sAdd: jest.fn().mockResolvedValue(undefined),
      sMembers: jest.fn().mockResolvedValue([]),
    };

    service = new LeaderboardService(
      indexer as unknown as IndexerService,
      redis as unknown as MetadataRedisService,
    );
  });

  describe('getLeaderboard — cache miss', () => {
    it('calls indexer, caches the result, and returns cacheHit=false', async () => {
      const result = await service.getLeaderboard({});

      expect(result.cacheHit).toBe(false);
      expect(result.data).toEqual(mockData);
      expect(indexer.getLeaderboard).toHaveBeenCalledTimes(1);
      expect(redis.setEx).toHaveBeenCalledWith(
        service.cacheKey({}),
        LEADERBOARD_CACHE_TTL,
        JSON.stringify(mockData),
      );
    });
  });

  describe('getLeaderboard — cache hit', () => {
    it('returns cached value and does not call indexer on second request', async () => {
      const cached = JSON.stringify(mockData);
      redis.get.mockResolvedValue(cached);

      const result = await service.getLeaderboard({});

      expect(result.cacheHit).toBe(true);
      expect(result.data).toEqual(mockData);
      expect(indexer.getLeaderboard).not.toHaveBeenCalled();
      expect(redis.setEx).not.toHaveBeenCalled();
    });
  });

  describe('invalidateAll', () => {
    it('deletes all tracked keys and the index set', async () => {
      const key = service.cacheKey({});
      redis.sMembers.mockResolvedValue([key]);

      await service.invalidateAll();

      expect(redis.del).toHaveBeenCalledWith(key);
      expect(redis.del).toHaveBeenCalledWith('leaderboard:__keys__');
    });

    it('is a no-op when no keys are tracked', async () => {
      await service.invalidateAll();

      // Only the index key itself is deleted; no data key deletions
      expect(redis.del).toHaveBeenCalledTimes(1);
      expect(redis.del).toHaveBeenCalledWith('leaderboard:__keys__');
    });
  });
});
