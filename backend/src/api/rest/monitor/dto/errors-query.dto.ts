import { ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import { MAX_PAGE_LIMIT, DEFAULT_PAGE_LIMIT } from '../../../../common/dto/pagination-query.dto';

/** Query params for GET /monitor/errors */
export const ErrorsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT).optional(),
});

export class ErrorsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_LIMIT, default: DEFAULT_PAGE_LIMIT, description: 'Number of errors to return' })
  limit?: number;
}

