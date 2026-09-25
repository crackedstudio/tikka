import { ApiPropertyOptional } from '@nestjs/swagger';
import { z } from "zod";
import { MAX_PAGE_LIMIT } from '../../../../common/dto/pagination-query.dto';

export const AuditQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
  })
  .refine(
    (value) => {
      if (!value.from || !value.to) {
        return true;
      }

      return new Date(value.from).getTime() <= new Date(value.to).getTime();
    },
    {
      path: ["from"],
      message: "from must be before to",
    },
  );

export class AuditQueryDto {
  @ApiPropertyOptional({ description: 'Start datetime (ISO 8601)' })
  from?: string;

  @ApiPropertyOptional({ description: 'End datetime (ISO 8601)' })
  to?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_LIMIT, description: 'Number of logs to return' })
  limit?: number;
}
