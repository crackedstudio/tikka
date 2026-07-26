import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

export const SearchQuerySchema = z.object({
  q: z.string(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
  category: z.string().trim().optional(),
    status: z.string().trim().optional(),
  sort: z.enum(['relevance', 'ending_soon', 'price_asc', 'most_tickets']).optional(),
});

export class SearchQueryDto {
  @ApiProperty({ description: 'Search query' })
  q: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  offset?: number;

  @ApiPropertyOptional({ description: 'Filter by category' })
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by status' })
  status?: string;

  @ApiPropertyOptional({
    description: 'Sort order for results',
    enum: ['relevance', 'ending_soon', 'price_asc', 'most_tickets'],
  })
  sort?: 'relevance' | 'ending_soon' | 'price_asc' | 'most_tickets';
}
