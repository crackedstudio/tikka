import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { z } from 'zod';
import { MAX_PAGE_LIMIT as MAX_PARTICIPANTS_LIMIT, PaginationQuerySchema, PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export { MAX_PARTICIPANTS_LIMIT };

export const ParticipantListQuerySchema = PaginationQuerySchema.extend({
  since: z.coerce
    .number({ invalid_type_error: 'since must be a number' })
    .int('since must be an integer')
    .min(0, 'since must be at least 0')
    .optional(),
});

export class ParticipantListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Return participants with purchase timestamps after this Unix ms value',
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  since?: number;
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