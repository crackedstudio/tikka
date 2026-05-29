import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

/** Notification event types */
export const NotificationEventTypes = [
  'raffle_started',
  'ticket_sold',
  'draw_completed',
  'you_won',
  'raffle_ending_soon',
] as const;

export type NotificationEventType = (typeof NotificationEventTypes)[number];

/** Request body for POST /notifications/subscribe */
export const SubscribeSchema = z.object({
  raffleId: z.number().int().positive(),
  channel: z.enum(['email', 'push']).optional().default('email'),
  events: z.array(z.enum(NotificationEventTypes)).optional().default(NotificationEventTypes),
});

export class SubscribeDto {
  @ApiProperty({ description: 'Internal raffle ID' })
  raffleId: number;

  @ApiPropertyOptional({ enum: ['email', 'push'], default: 'email', description: 'Notification channel' })
  channel?: 'email' | 'push';

  @ApiPropertyOptional({ enum: NotificationEventTypes, isArray: true, default: NotificationEventTypes, description: 'Events to subscribe to' })
  events?: NotificationEventType[];
}
