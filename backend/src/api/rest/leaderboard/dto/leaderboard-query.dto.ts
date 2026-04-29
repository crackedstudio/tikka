import { z } from 'zod';

/** Query params for GET /leaderboard */
export const LeaderboardQuerySchema = z.object({
  by: z.enum(['wins', 'volume', 'tickets']).default('wins').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  cursor: z.string().min(1).optional(),
  // Deprecated: offset pagination is kept for backward compatibility.
  offset: z.coerce.number().int().min(0).optional(),
});

export type LeaderboardQueryDto = z.infer<typeof LeaderboardQuerySchema>;
