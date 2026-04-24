import { Injectable } from '@nestjs/common';
import {
  IndexerService,
  IndexerLeaderboardResponse,
  IndexerLeaderboardFilters,
} from '../../../services/indexer.service';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';

@Injectable()
export class LeaderboardService {
  constructor(private readonly indexerService: IndexerService) {}

  /** Get leaderboard entries sorted by wins, volume, or tickets. */
  async getLeaderboard(query: LeaderboardQueryDto): Promise<IndexerLeaderboardResponse> {
    const filters: IndexerLeaderboardFilters = {
      by: query.by,
      limit: query.limit,
    };
    return this.indexerService.getLeaderboard(filters);
  }
}
