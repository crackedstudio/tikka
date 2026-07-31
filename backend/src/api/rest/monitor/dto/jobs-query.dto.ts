import { ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import { MAX_PAGE_LIMIT, DEFAULT_PAGE_LIMIT } from '../../../../common/dto/pagination-query.dto';

/** Query params for GET /monitor/jobs */
export const JobsQuerySchema = z.object({
  status: z.enum(['pending', 'completed', 'failed']).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT).optional(),
  cursor: z.string().optional(),
});

export class JobsQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'completed', 'failed'], description: 'Job status' })
  status?: 'pending' | 'completed' | 'failed';

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_LIMIT, default: DEFAULT_PAGE_LIMIT, description: 'Number of jobs to return' })
  limit?: number;

  @ApiPropertyOptional({ description: 'Pagination cursor' })
  cursor?: string;
}

