import { z } from 'zod';

export const CreateWebhookSchema = z.object({
  targetUrl: z.string().url('Must be a valid URL'),
  events: z.array(z.string()).min(1, 'At least one event must be specified'),
});

export type CreateWebhookDto = z.infer<typeof CreateWebhookSchema>;

export const UpdateWebhookSchema = z.object({
  targetUrl: z.string().url('Must be a valid URL').optional(),
  events: z.array(z.string()).min(1).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateWebhookDto = z.infer<typeof UpdateWebhookSchema>;
