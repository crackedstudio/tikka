import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

export const MAX_PARTICIPANTS_LIMIT = 100;

export const ParticipantListQuerySchema = z.object({
  limit: z.coerce
    .number({ invalid_type_error: 'limit must be a number' })
    .int('limit must be an integer')
    .min(1, 'limit must be at least 1')
    .max(MAX_PARTICIPANTS_LIMIT, `limit must not exceed ${MAX_PARTICIPANTS_LIMIT}`)
    .default(20),
  offset: z.coerce
    .number({ invalid_type_error: 'offset must be a number' })
    .int('offset must be an integer')
    .min(0, 'offset must be at least 0')
    .default(0),
});

export class ParticipantListQueryDto {
  @ApiPropertyOptional({
    description: 'Number of records to return',
    minimum: 1,
    maximum: MAX_PARTICIPANTS_LIMIT,
    default: 20,
  })
  limit?: number;

  @ApiPropertyOptional({
    description: 'Number of records to skip',
    minimum: 0,
    default: 0,
  })
  offset?: number;
}

export class ParticipantDto {
  @ApiProperty({
    description: 'Stellar address of the ticket holder',
    example: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
  })
  address: string;

  @ApiProperty({
    description: 'Number of tickets purchased by this address for this raffle',
    example: 5,
    minimum: 1,
  })
  tickets_count: number;

  @ApiProperty({
    description: 'Unix timestamp (in seconds) when the first ticket was purchased',
    example: 1234567890,
  })
  purchased_at: number;
}

export class ParticipantListResponseDto {
  @ApiProperty({
    description: 'List of participants (ticket holders) for the raffle',
    type: [ParticipantDto],
  })
  participants: ParticipantDto[];

  @ApiProperty({
    description: 'Total number of unique participants',
    example: 42,
  })
  total: number;

  @ApiProperty({
    description: 'Number of records returned in this page',
    example: 10,
  })
  limit: number;

  @ApiProperty({
    description: 'Number of records skipped',
    example: 0,
  })
  offset: number;
}