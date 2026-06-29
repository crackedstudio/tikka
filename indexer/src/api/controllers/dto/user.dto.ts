import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatorStatsDto {
  @ApiProperty() raffles_created: number;
  @ApiProperty() total_tickets_sold: number;
  @ApiProperty() total_xlm_raised: string;
  @ApiProperty() participant_win_rate: number;
}

export class UserProfileDto {
  @ApiProperty() address: string;
  @ApiProperty() total_tickets_bought: number;
  @ApiProperty() total_raffles_entered: number;
  @ApiProperty() total_raffles_won: number;
  @ApiProperty() total_prize_xlm: string;
  @ApiPropertyOptional({ type: CreatorStatsDto }) creator_stats?: CreatorStatsDto;
}

export class UserLeaderboardEntryDto {
  @ApiProperty() rank: number;
  @ApiProperty() address: string;
  @ApiProperty() total_tickets_bought: number;
  @ApiProperty() total_raffles_won: number;
  @ApiProperty() total_prize_xlm: string;
  @ApiProperty() total_raffles_entered: number;
}

export class UserLeaderboardResponseDto {
  @ApiProperty({ type: [UserLeaderboardEntryDto] }) data: UserLeaderboardEntryDto[];
  @ApiProperty() total: number;
  @ApiProperty() limit: number;
  @ApiProperty() offset: number;
}
