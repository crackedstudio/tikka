import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

/**
 * Maximum length for search query strings.
 * Prevents abuse via excessively long input.
 */
export const SEARCH_QUERY_MAX_LENGTH = 200;

/**
 * Maximum length for category filter.
 */
export const CATEGORY_MAX_LENGTH = 100;

/**
 * Maximum length for status filter.
 */
export const STATUS_MAX_LENGTH = 50;

export const SearchQuerySchema = z.object({
  q: z
    .string()
    .min(1, 'Search query must not be empty')
    .max(SEARCH_QUERY_MAX_LENGTH, `Search query must not exceed ${SEARCH_QUERY_MAX_LENGTH} characters`),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
  category: z
    .string()
    .max(CATEGORY_MAX_LENGTH, `Category must not exceed ${CATEGORY_MAX_LENGTH} characters`)
    .trim()
    .optional(),
  status: z
    .string()
    .max(STATUS_MAX_LENGTH, `Status must not exceed ${STATUS_MAX_LENGTH} characters`)
    .trim()
    .optional(),
  sort: z.enum(['relevance', 'ending_soon', 'price_asc', 'most_tickets']).optional(),
}).strict('Unknown query parameter(s) detected: please only use valid search parameters');

export class SearchQueryDto {
  @ApiProperty({ description: 'Search query (max 200 characters)' })
  q: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  offset?: number;

  @ApiPropertyOptional({ description: 'Filter by category (max 100 characters)' })
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by status (max 50 characters)' })
  status?: string;

  @ApiPropertyOptional({
    description: 'Sort order for results',
    enum: ['relevance', 'ending_soon', 'price_asc', 'most_tickets'],
  })
  sort?: 'relevance' | 'ending_soon' | 'price_asc' | 'most_tickets';
}
