import { ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

/** Request body for PATCH /notifications/:raffleId */
export const UpdateSubscriptionSchema = z.object({
  channel: z.enum(['email', 'push']).optional(),
});

export class UpdateSubscriptionDto {
  @ApiPropertyOptional({ enum: ['email', 'push'], description: 'Notification channel' })
  channel?: 'email' | 'push';
}
