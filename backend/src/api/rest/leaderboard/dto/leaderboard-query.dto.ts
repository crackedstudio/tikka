import { ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

/** Query params for GET /leaderboard */
export const LeaderboardQuerySchema = z.object({
  by: z.enum(['wins', 'volume', 'tickets']).default('wins').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  cursor: z.string().min(1).optional(),
  // Deprecated: offset pagination is kept for backward compatibility.
  offset: z.coerce.number().int().min(0).optional(),
  period: z.enum(['all', 'monthly', 'weekly']).default('all').optional(),
});

export class LeaderboardQueryDto {
  @ApiPropertyOptional({ enum: ['wins', 'volume', 'tickets'], default: 'wins', description: 'Sort field' })
  by?: 'wins' | 'volume' | 'tickets';

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20, description: 'Number of entries' })
  limit?: number;

  @ApiPropertyOptional({ description: 'Cursor for cursor-based pagination' })
  cursor?: string;

  @ApiPropertyOptional({ minimum: 0, description: 'Offset for offset-based pagination (deprecated)' })
  offset?: number;

  @ApiPropertyOptional({ enum: ['all', 'monthly', 'weekly'], default: 'all', description: 'Time period filter' })
  period?: 'all' | 'monthly' | 'weekly';
}
