import { ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import { PaginationQuerySchema, PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

/** Query params for GET /leaderboard */
export const LeaderboardQuerySchema = PaginationQuerySchema.extend({
  by: z.enum(['wins', 'volume', 'tickets']).default('wins').optional(),
  cursor: z.string().min(1).optional(),
});

export class LeaderboardQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['wins', 'volume', 'tickets'], default: 'wins', description: 'Sort field' })
  by?: 'wins' | 'volume' | 'tickets';

  @ApiPropertyOptional({ description: 'Cursor for cursor-based pagination' })
  cursor?: string;
}
