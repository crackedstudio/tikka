/** TTL constants (in seconds) grouped by cache category. */
export const CacheTTL = {
  /** Short-lived: data changes frequently (leaderboard). */
  LEADERBOARD: 60,

  /** Medium-lived: raffle data changes on purchase/finalize. */
  ACTIVE_RAFFLES: 30,
  RAFFLE_DETAIL: 10,

  /** Long-lived: user profiles change infrequently. */
  USER_PROFILE: 300,

  /** Background stats, refreshed on a slow cadence. */
  PLATFORM_STATS: 300,
} as const;
