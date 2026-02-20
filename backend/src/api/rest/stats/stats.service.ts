import { Injectable } from '@nestjs/common';
import {
  IndexerService,
  IndexerPlatformStats,
} from '../../../services/indexer.service';

@Injectable()
export class StatsService {
  constructor(private readonly indexerService: IndexerService) {}

  /** Get platform-wide aggregate stats. */
  async getPlatformStats(): Promise<IndexerPlatformStats> {
    return this.indexerService.getPlatformStats();
  }
}
