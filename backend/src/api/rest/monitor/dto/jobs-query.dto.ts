import { z } from 'zod';

/** Query params for GET /monitor/jobs */
export const JobsQuerySchema = z.object({
  status: z.enum(['pending', 'completed', 'failed']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
  cursor: z.string().optional(),
});

export type JobsQueryDto = z.infer<typeof JobsQuerySchema>;
