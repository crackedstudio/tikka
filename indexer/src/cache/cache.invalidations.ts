import { CacheService } from './cache.service';
import { CacheKeys } from './cache.keys';

/**
 * Structured invalidation rules. Each function encapsulates everything that must
 * be evicted when a particular event occurs. Callers never construct keys directly.
 */
export const CacheInvalidations = {
  /**
   * Invalidate on ticket purchase: raffle detail, active list, leaderboard,
   * and the buyer's profile.
   */
  async onPurchase(cache: CacheService, raffleId: string, buyerAddress: string): Promise<void> {
    await Promise.all([
      cache.del(CacheKeys.raffle.detail(raffleId)),
      cache.del(CacheKeys.raffle.active()),
      cache.del(CacheKeys.leaderboard.global()),
      cache.del(CacheKeys.user.profile(buyerAddress)),
    ]);
  },

  /**
   * Invalidate on raffle finalize: raffle detail, active list, leaderboard,
   * platform stats, and the winner's profile.
   */
  async onFinalize(cache: CacheService, raffleId: string, winnerAddress: string): Promise<void> {
    await Promise.all([
      cache.del(CacheKeys.raffle.detail(raffleId)),
      cache.del(CacheKeys.raffle.active()),
      cache.del(CacheKeys.leaderboard.global()),
      cache.del(CacheKeys.stats.platform()),
      cache.del(CacheKeys.user.profile(winnerAddress)),
    ]);
  },
};
