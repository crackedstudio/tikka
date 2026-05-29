import { ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

/** Query params for GET /monitor/jobs */
export const JobsQuerySchema = z.object({
  status: z.enum(['pending', 'completed', 'failed']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
  cursor: z.string().optional(),
});

export class JobsQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'completed', 'failed'], description: 'Job status' })
  status?: 'pending' | 'completed' | 'failed';

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50, description: 'Number of jobs to return' })
  limit?: number;

  @ApiPropertyOptional({ description: 'Pagination cursor' })
  cursor?: string;
}

