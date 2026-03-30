import { z } from 'zod';

export const DeviceTokenSchema = z.object({
  deviceToken: z.string().min(1),
  platform: z.enum(['fcm']).optional().default('fcm'),
});

export type DeviceTokenDto = z.infer<typeof DeviceTokenSchema>;