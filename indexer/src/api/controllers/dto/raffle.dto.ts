import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RaffleListItemDto {
  @ApiProperty() id!: number;
  @ApiProperty() creator!: string;
  @ApiProperty({ enum: ['open', 'drawing', 'finalized', 'cancelled'] }) status!:
    'open' | 'drawing' | 'finalized' | 'cancelled';
  @ApiProperty() ticket_price!: string;
  @ApiProperty() asset!: string;
  @ApiProperty() max_tickets!: number;
  @ApiProperty() tickets_sold!: number;
  @ApiProperty() end_time!: string;
  @ApiPropertyOptional({ nullable: true }) winner!: string | null;
  @ApiPropertyOptional({ nullable: true }) prize_amount!: string | null;
  @ApiPropertyOptional({ nullable: true }) metadata_cid!: string | null;
  @ApiProperty() created_at!: string;
}

export class RaffleDetailDto extends RaffleListItemDto {
  @ApiPropertyOptional({ nullable: true }) winning_ticket_id!: number | null;
  @ApiProperty() ticket_count!: number;
}

export class UserRaffleHistoryItemDto extends RaffleListItemDto {
  @ApiProperty() user_tickets!: number;
  @ApiProperty() won!: boolean;
}

export class RaffleListResponseDto {
  @ApiProperty({ type: [RaffleListItemDto] }) data!: RaffleListItemDto[];
  @ApiProperty({ description: 'Total count of matching raffles (null if cursor-paginated for performance)' }) total!: number | null;
  @ApiProperty() limit!: number;
  @ApiPropertyOptional({ nullable: true, description: 'Numeric offset (null if cursor-paginated)' }) offset!: number | null;
  @ApiPropertyOptional({ nullable: true, description: 'Opaque cursor token for next page (null if no more results)' }) nextCursor?: string | null;
}

export class UserRaffleHistoryResponseDto {
  @ApiProperty({ type: [UserRaffleHistoryItemDto] }) data!: UserRaffleHistoryItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
}
