import { z } from 'zod';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_PAGE_LIMIT, DEFAULT_PAGE_LIMIT, PaginationQuerySchema } from '../../../../common/dto/pagination-query.dto';

export { MAX_PAGE_LIMIT };

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;
const ASSET_CODE_RE = /^[A-Za-z0-9]+$/;

/** Query params for GET /raffles */
export const ListRafflesQuerySchema = PaginationQuerySchema.extend({
  status: z
    .string()
    .max(50, 'status must be at most 50 characters')
    .optional(),
  category: z
    .string()
    .max(100, 'category must be at most 100 characters')
    .optional(),
  creator: z
    .string()
    .regex(
      STELLAR_ADDRESS_RE,
      'creator must be a valid Stellar public key (G followed by 55 base-32 characters)',
    )
    .optional(),
  asset: z
    .string()
    .min(1, 'asset code must be at least 1 character')
    .max(12, 'asset code must be at most 12 characters')
    .regex(ASSET_CODE_RE, 'asset code must contain only alphanumeric characters')
    .optional(),
});

export class ListRafflesQueryDto {
  @ApiPropertyOptional({ description: 'Filter by raffle status', maxLength: 50 })
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by raffle category', maxLength: 100 })
  category?: string;

  @ApiPropertyOptional({
    description: 'Filter by raffle creator — must be a valid Stellar public key',
    pattern: '^G[A-Z2-7]{55}$',
  })
  creator?: string;

  @ApiPropertyOptional({
    description: 'Filter by asset code (1–12 alphanumeric characters)',
    minLength: 1,
    maxLength: 12,
    pattern: '^[A-Za-z0-9]+$',
  })
  asset?: string;

  @ApiPropertyOptional({
    description: 'Number of records to return',
    minimum: 1,
    maximum: MAX_PAGE_LIMIT,
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
