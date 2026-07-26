import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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