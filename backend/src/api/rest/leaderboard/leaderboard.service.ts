import { Injectable } from '@nestjs/common';
import {
  IndexerService,
  IndexerLeaderboardResponse,
  IndexerLeaderboardFilters,
} from '../../../services/indexer.service';
import { MetadataRedisService } from '../../../services/metadata-redis.service';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';

export const LEADERBOARD_CACHE_TTL = 60;
/** Redis set that tracks every leaderboard cache key currently written. */
const LEADERBOARD_KEY_INDEX = 'leaderboard:__keys__';

@Injectable()
export class LeaderboardService {
  constructor(
    private readonly indexerService: IndexerService,
    private readonly redis: MetadataRedisService,
  ) {}

  cacheKey(query: LeaderboardQueryDto): string {
    const by = query.by ?? 'wins';
    const limit = query.limit ?? 20;
    const cursor = query.cursor ?? '';
    const offset = query.offset ?? '';
    return `leaderboard:${by}:${limit}:${cursor}:${offset}`;
  }

  /** Get leaderboard entries, served from cache when available. */
  async getLeaderboard(
    query: LeaderboardQueryDto,
  ): Promise<{ data: IndexerLeaderboardResponse; cacheHit: boolean }> {
    const key = this.cacheKey(query);
    const cached = await this.redis.get(key);
    if (cached) {
      return { data: JSON.parse(cached) as IndexerLeaderboardResponse, cacheHit: true };
    }

    const filters: IndexerLeaderboardFilters = {
      by: query.by,
      limit: query.limit,
      cursor: query.cursor,
      offset: query.offset,
    };
    const data = await this.indexerService.getLeaderboard(filters);
    await this.redis.setEx(key, LEADERBOARD_CACHE_TTL, JSON.stringify(data));
    // Track this key so invalidateAll can delete it later.
    await this.redis.sAdd(LEADERBOARD_KEY_INDEX, key);
    return { data, cacheHit: false };
  }

  /** Invalidate all leaderboard cache keys (called on RaffleFinalized). */
  async invalidateAll(): Promise<void> {
    const keys = await this.redis.sMembers(LEADERBOARD_KEY_INDEX);
    await Promise.all(keys.map((k) => this.redis.del(k)));
    await this.redis.del(LEADERBOARD_KEY_INDEX);
  }
}
