import { z } from 'zod';

/** Request body for POST /notifications/subscribe */
export const SubscribeSchema = z.object({
  raffleId: z.number().int().positive(),
  channel: z.enum(['email', 'push']).optional().default('email'),
});

export type SubscribeDto = z.infer<typeof SubscribeSchema>;
