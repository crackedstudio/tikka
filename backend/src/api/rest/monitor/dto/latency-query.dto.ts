import { ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

/** Query params for GET /monitor/latency */
export const LatencyQuerySchema = z.object({
  from: z.string().datetime("Invalid datetime format for 'from'").optional(),
  to: z.string().datetime("Invalid datetime format for 'to'").optional(),
});

export class LatencyQueryDto {
  @ApiPropertyOptional({ description: 'Start datetime (ISO 8601)' })
  from?: string;

  @ApiPropertyOptional({ description: 'End datetime (ISO 8601)' })
  to?: string;
}

