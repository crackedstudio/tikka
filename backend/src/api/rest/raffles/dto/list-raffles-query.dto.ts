import { z } from 'zod';

/** Query params for GET /raffles */
export const ListRafflesQuerySchema = z.object({
  status: z.string().optional(),
  category: z.string().optional(),
  creator: z.string().optional(),
  asset: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
});

export type ListRafflesQueryDto = z.infer<typeof ListRafflesQuerySchema>;
