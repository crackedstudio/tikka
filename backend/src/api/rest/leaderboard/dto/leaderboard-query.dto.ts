import { z } from 'zod';

/** Query params for GET /leaderboard */
export const LeaderboardQuerySchema = z.object({
  by: z.enum(['wins', 'volume', 'tickets']).default('wins').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
});

export type LeaderboardQueryDto = z.infer<typeof LeaderboardQuerySchema>;
