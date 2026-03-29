import { z } from 'zod';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Query params for GET /users/:address/history */
export const UserHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
});

export class UserHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Number of records to return',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  limit?: number;

  @ApiPropertyOptional({
    description: 'Number of records to skip',
    minimum: 0,
    default: 0,
  })
  offset?: number;
}
