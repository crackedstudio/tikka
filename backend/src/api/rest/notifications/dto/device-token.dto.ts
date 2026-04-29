import { z } from 'zod';
import { NotificationEventTypes } from './subscribe.dto';

export const DeviceTokenSchema = z.object({
  deviceToken: z.string().min(1),
  platform: z.enum(['fcm']).optional().default('fcm'),
  events: z.array(z.enum(NotificationEventTypes)).optional().default(NotificationEventTypes),
});

export type DeviceTokenDto = z.infer<typeof DeviceTokenSchema>;