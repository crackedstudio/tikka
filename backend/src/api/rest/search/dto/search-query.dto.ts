import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import { PaginationQuerySchema, PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export const SearchQuerySchema = PaginationQuerySchema.extend({
  q: z.string(),
  category: z.string().trim().optional(),
  status: z.string().trim().optional(),
  sort: z.enum(['relevance', 'ending_soon', 'price_asc', 'most_tickets']).optional(),
});

export class SearchQueryDto extends PaginationQueryDto {
  @ApiProperty({ description: 'Search query' })
  q: string;

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
