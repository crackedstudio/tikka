import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';

export const MAX_TICKET_QUANTITY = 100;

export const PurchaseTicketSchema = z.object({
  quantity: z.coerce
    .number({ invalid_type_error: 'quantity must be a number' })
    .int('quantity must be an integer')
    .min(1, 'quantity must be at least 1')
    .max(MAX_TICKET_QUANTITY, `quantity must not exceed ${MAX_TICKET_QUANTITY}`),
});

export class PurchaseTicketDto {
  @ApiProperty({
    description: 'Number of tickets to purchase',
    minimum: 1,
    maximum: MAX_TICKET_QUANTITY,
  })
  quantity!: number;
}

export type PurchaseTicketPayload = z.infer<typeof PurchaseTicketSchema>;
