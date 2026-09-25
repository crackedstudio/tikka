import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { z } from 'zod';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

/**
 * IMMUTABLE: These limits are enforced at both the DTO and API layer.
 * DO NOT override, increase, or bypass these values in endpoint implementations.
 * - MIN_PAGE_LIMIT = 1: Prevents empty/zero-result pages
 * - MAX_PAGE_LIMIT = 100: Prevents resource exhaustion and ensures stable pagination under concurrent writes
 * - DEFAULT_PAGE_LIMIT = 20: Balances response size and user experience
 * 
 * Enforcing limits at the DTO level ensures:
 * 1. Clients cannot request excessive data (DoS protection)
 * 2. Pagination remains stable under concurrent inserts
 * 3. Database query performance is predictable
 */

/**
 * Shared Zod schema for pagination query parameters across REST endpoints.
 * Enforces limit between 1 and 100 (default 20) and non-negative offset (default 0).
 * 
 * This schema MUST be used with `createZodPipe()` for validation in all REST controllers.
 * Do not allow endpoint-specific overrides of limit constraints.
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
 * 
 * IMPORTANT: These constraints are immutable and apply to ALL list endpoints.
 * Endpoints MUST NOT override @Max() or @Min() decorators to allow higher limits.
 * 
 * Rationale:
 * - limit: 1-100 prevents database exhaustion and ensures stable pagination
 *   under concurrent writes (no offset drift on deep pages)
 * - offset: >= 0 prevents negative pagination
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Number of items to return per page (1-100, default 20). Cannot be overridden higher.',
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
    description: 'Number of items to skip (offset pagination)',
    minimum: 0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

/**
 * Validation helper to ensure endpoints are not bypassing pagination limits.
 * Use this in tests to verify that custom DTOs extending PaginationQueryDto
 * do not increase the MAX_PAGE_LIMIT.
 */
export function validatePaginationLimitsNotOverridden(dto: any): {
  valid: boolean;
  error?: string;
} {
  if (dto.limit !== undefined && dto.limit > MAX_PAGE_LIMIT) {
    return {
      valid: false,
      error: `limit ${dto.limit} exceeds MAX_PAGE_LIMIT ${MAX_PAGE_LIMIT}`,
    };
  }
  return { valid: true };
}
