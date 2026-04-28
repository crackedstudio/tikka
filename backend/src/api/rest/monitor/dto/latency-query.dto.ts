import { z } from 'zod';

/** Query params for GET /monitor/latency */
export const LatencyQuerySchema = z.object({
  from: z.string().datetime("Invalid datetime format for 'from'").optional(),
  to: z.string().datetime("Invalid datetime format for 'to'").optional(),
});

export type LatencyQueryDto = z.infer<typeof LatencyQuerySchema>;
