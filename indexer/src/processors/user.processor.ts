import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class UserProcessor {
  private readonly logger = new Logger(UserProcessor.name);

  constructor(private cacheService: CacheService) {}

  /**
   * Called when a TicketPurchased event is indexed.
   * Invalidates the buyer's user profile cache and the raffle detail.
   */
  async handleTicketPurchased(address: string, raffleId: string) {
    this.logger.log(`Handling TicketPurchased for ${address} in raffle ${raffleId}`);
    // DB write logic would go here

    // Invalidate caches
    await this.cacheService.invalidateUserProfile(address);
    // Detail must be invalidated because tickets_sold / participant_count change
    await this.cacheService.invalidateRaffleDetail(raffleId);
  }

  /**
   * Called when a TicketRefunded event is indexed.
   * Invalidates the recipient's user profile cache and the raffle detail.
   */
  async handleTicketRefunded(address: string, raffleId: string) {
    this.logger.log(`Handling TicketRefunded for ${address} in raffle ${raffleId}`);
    // DB write logic would go here

    // Invalidate caches
    await this.cacheService.invalidateUserProfile(address);
    await this.cacheService.invalidateRaffleDetail(raffleId);
  }
}
