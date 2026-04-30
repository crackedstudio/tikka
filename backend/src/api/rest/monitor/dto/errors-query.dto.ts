import { ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

/** Query params for GET /monitor/errors */
export const ErrorsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
});

export class ErrorsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50, description: 'Number of errors to return' })
  limit?: number;
}

