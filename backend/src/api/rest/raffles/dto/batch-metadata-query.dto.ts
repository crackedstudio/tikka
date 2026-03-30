import { z } from 'zod';

/** Query params for GET /raffles/metadata?ids=1,2,3 */
export const BatchMetadataQuerySchema = z.object({
  ids: z
    .string()
    .min(1)
    .transform((val) =>
      val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const n = parseInt(s, 10);
          if (isNaN(n) || n <= 0) throw new Error(`Invalid raffle id: "${s}"`);
          return n;
        }),
    )
    .refine((ids) => ids.length <= 100, {
      message: 'Cannot request more than 100 IDs at once',
    }),
});

export type BatchMetadataQueryDto = z.infer<typeof BatchMetadataQuerySchema>;
