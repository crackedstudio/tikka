import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type LeaderboardMode = 'wins' | 'volume' | 'tickets';

export class LeaderboardEntryDto {
  @ApiPropertyOptional({ nullable: true }) rank: number | null;
  @ApiProperty() address: string;
  @ApiProperty() totalTicketsBought: number;
  @ApiProperty() totalRafflesWon: number;
  @ApiProperty() totalPrizeXlm: string;
}

export class LeaderboardResponseDto {
  @ApiProperty({ enum: ['wins', 'volume', 'tickets'] }) by: LeaderboardMode;
  @ApiProperty() limit: number;
  @ApiPropertyOptional({ nullable: true }) offset: number | null;
  @ApiProperty({ type: [String] }) ranking: string[];
  @ApiProperty({ type: [LeaderboardEntryDto] }) entries: LeaderboardEntryDto[];
  @ApiPropertyOptional({ nullable: true }) nextCursor: string | null;
}
