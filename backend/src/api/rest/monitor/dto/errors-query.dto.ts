import { z } from 'zod';

/** Query params for GET /monitor/errors */
export const ErrorsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
});

export type ErrorsQueryDto = z.infer<typeof ErrorsQuerySchema>;

