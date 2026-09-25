import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { z } from 'zod';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

/**
 * Shared Zod schema for pagination query parameters across REST endpoints.
 * Enforces limit between 1 and 100 (default 20) and non-negative offset (default 0).
 */
export const PaginationQuerySchema = z.object({
  limit: z.coerce
    .number({ invalid_type_error: 'limit must be a number' })
    .int('limit must be an integer')
    .min(1, 'limit must be at least 1')
    .max(MAX_PAGE_LIMIT, `limit must not exceed ${MAX_PAGE_LIMIT}`)
    .default(DEFAULT_PAGE_LIMIT),
  offset: z.coerce
    .number({ invalid_type_error: 'offset must be a number' })
    .int('offset must be an integer')
    .min(0, 'offset must be at least 0')
    .default(0),
});

/**
 * Shared Class-Validator / NestJS Swagger DTO for pagination query parameters.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Number of items to return (1-100)',
    minimum: 1,
    maximum: MAX_PAGE_LIMIT,
    default: DEFAULT_PAGE_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit?: number = DEFAULT_PAGE_LIMIT;

  @ApiPropertyOptional({
    description: 'Number of items to skip',
    minimum: 0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
