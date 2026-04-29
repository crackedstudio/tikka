import { z } from 'zod';

export const SearchQuerySchema = z.object({
  q: z.string(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
  category: z.string().trim().optional(),
  status: z.string().trim().optional(),
});

export type SearchQueryDto = z.infer<typeof SearchQuerySchema>;
