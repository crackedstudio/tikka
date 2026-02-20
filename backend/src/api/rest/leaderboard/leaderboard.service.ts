import { Injectable } from '@nestjs/common';
import {
  IndexerService,
  IndexerLeaderboardResponse,
} from '../../../services/indexer.service';

@Injectable()
export class LeaderboardService {
  constructor(private readonly indexerService: IndexerService) {}

  /** Get leaderboard entries (top participants by wins, volume, tickets). */
  async getLeaderboard(): Promise<IndexerLeaderboardResponse> {
    return this.indexerService.getLeaderboard();
  }
}
