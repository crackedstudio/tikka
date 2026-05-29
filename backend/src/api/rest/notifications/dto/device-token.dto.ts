import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import { NotificationEventTypes, type NotificationEventType } from './subscribe.dto';

export const DeviceTokenSchema = z.object({
  deviceToken: z.string().min(1),
  platform: z.enum(['fcm']).optional().default('fcm'),
  events: z.array(z.enum(NotificationEventTypes)).optional().default(NotificationEventTypes),
});

export class DeviceTokenDto {
  @ApiProperty({ description: 'FCM device token' })
  deviceToken: string;

  @ApiPropertyOptional({ enum: ['fcm'], default: 'fcm', description: 'Push notification platform' })
  platform?: 'fcm';

  @ApiPropertyOptional({ enum: NotificationEventTypes, isArray: true, default: NotificationEventTypes, description: 'Events to subscribe to' })
  events?: NotificationEventType[];
}