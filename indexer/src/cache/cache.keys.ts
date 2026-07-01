/**
 * Centralized cache key definitions. All cache key construction must go through
 * these helpers — no raw string concatenation elsewhere.
 */
export const CacheKeys = {
  raffle: {
    active: () => 'raffle:active' as const,
    detail: (id: string) => `raffle:${id}`,
  },
  leaderboard: {
    global: () => 'leaderboard' as const,
  },
  user: {
    profile: (address: string) => `user:${address}`,
  },
  stats: {
    platform: () => 'stats:platform' as const,
  },
} as const;
