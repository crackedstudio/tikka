import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const MAX_BATCH_IDS = 50;

/** Query params for GET /raffles/metadata?ids=1,2,3 */
export const BatchMetadataQuerySchema = z.object({
  ids: z
    .string()
    .min(1, 'ids must not be empty')
    .transform((val, ctx) => {
      const items = val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const result: number[] = [];
      for (const s of items) {
        const n = Number(s);
        if (!Number.isInteger(n) || n <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid raffle ID "${s}": must be a positive integer`,
          });
          return z.NEVER;
        }
        result.push(n);
      }
      return result;
    })
    .refine((ids) => ids.length > 0, {
      message: 'At least one valid ID is required',
    })
    .refine((ids) => ids.length <= MAX_BATCH_IDS, {
      message: `Cannot request more than ${MAX_BATCH_IDS} IDs at once`,
    }),
});

export class BatchMetadataQueryDto {
  @ApiProperty({
    type: 'string',
    description: `Comma-separated list of raffle IDs (max ${MAX_BATCH_IDS})`,
    example: '1,2,3',
  })
  ids: number[];
}
