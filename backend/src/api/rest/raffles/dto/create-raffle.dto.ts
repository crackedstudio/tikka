import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';

export const CreateRaffleSchema = z.object({
  ticketPrice: z
    .string()
    .min(1, 'ticketPrice is required'),
  totalTickets: z.coerce
    .number({ invalid_type_error: 'totalTickets must be a number' })
    .int('totalTickets must be an integer')
    .positive('totalTickets must be a positive integer'),
  durationInSeconds: z.coerce
    .number({ invalid_type_error: 'durationInSeconds must be a number' })
    .int('durationInSeconds must be an integer')
    .positive('durationInSeconds must be a positive integer'),
});

export class CreateRaffleDto {
  @ApiProperty({ description: 'Ticket price in stroops (as string)', example: '10000000' })
  ticketPrice!: string;

  @ApiProperty({ description: 'Total number of tickets', example: 100, minimum: 1 })
  totalTickets!: number;

  @ApiProperty({ description: 'Raffle duration in seconds', example: 86400, minimum: 1 })
  durationInSeconds!: number;
}

export type CreateRafflePayload = z.infer<typeof CreateRaffleSchema>;
