import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class RaffleProcessor {
  private readonly logger = new Logger(RaffleProcessor.name);

  constructor(private cacheService: CacheService) {}

  /**
   * Called when a RaffleCreated event is indexed.
   * Invalidates active raffles list cache.
   */
  async handleRaffleCreated(raffleId: string) {
    this.logger.log(`Handling RaffleCreated for ${raffleId}`);
    // DB write logic would go here
    
    // Invalidate caches
    await this.cacheService.invalidateActiveRaffles();
  }

  /**
   * Called when a RaffleFinalized event is indexed.
   * Invalidates raffle detail and leaderboard.
   */
  async handleRaffleFinalized(raffleId: string) {
    this.logger.log(`Handling RaffleFinalized for ${raffleId}`);
    // DB write logic would go here

    // Invalidate caches
    await this.cacheService.invalidateRaffleDetail(raffleId);
    await this.cacheService.invalidateLeaderboard();
  }

  /**
   * Called when a RaffleCancelled event is indexed.
   * Invalidates raffle detail and active raffles list.
   */
  async handleRaffleCancelled(raffleId: string) {
    this.logger.log(`Handling RaffleCancelled for ${raffleId}`);
    // DB write logic would go here

    // Invalidate caches
    await this.cacheService.invalidateRaffleDetail(raffleId);
    await this.cacheService.invalidateActiveRaffles();
  }
}
