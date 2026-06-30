import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

/** Schema for GET response and PUT request body */
export const NotificationPreferencesSchema = z.object({
  raffleEnd: z.boolean().optional(),
  winNotification: z.boolean().optional(),
  channel: z.enum(['email', 'push']).optional(),
});

export class NotificationPreferencesDto {
  @ApiPropertyOptional({ description: 'Opt-in for raffle end notifications', default: true })
  raffleEnd?: boolean;

  @ApiPropertyOptional({ description: 'Opt-in for win notifications', default: true })
  winNotification?: boolean;

  @ApiPropertyOptional({ enum: ['email', 'push'], description: 'Preferred notification channel', default: 'email' })
  channel?: 'email' | 'push';
}

/** Response format for GET /notifications/preferences */
export interface NotificationPreferencesResponse {
  userAddress: string;
  raffleEnd: boolean;
  winNotification: boolean;
  channel: 'email' | 'push';
  updatedAt: string;
}
