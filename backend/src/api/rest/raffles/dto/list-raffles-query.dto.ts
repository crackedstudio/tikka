import { z } from 'zod';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Query params for GET /raffles */
export const ListRafflesQuerySchema = z.object({
  status: z.string().optional(),
  category: z.string().optional(),
  creator: z.string().optional(),
  asset: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
});

export class ListRafflesQueryDto {
  @ApiPropertyOptional({ description: 'Filter by raffle status' })
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by raffle category' })
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by raffle creator' })
  creator?: string;

  @ApiPropertyOptional({ description: 'Filter by asset code' })
  asset?: string;

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
