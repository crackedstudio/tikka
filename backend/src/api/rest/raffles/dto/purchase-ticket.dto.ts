import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';

export const PurchaseTicketSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(100),
});

export class PurchaseTicketDto {
  @ApiProperty({ description: 'Number of tickets to purchase', minimum: 1, maximum: 100 })
  quantity!: number;
}

export type PurchaseTicketPayload = z.infer<typeof PurchaseTicketSchema>;
