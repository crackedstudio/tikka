/**
 * User DTOs — stable contracts for API responses.
 * Hide internal fields like lastTxHash (removed from all responses).
 */

export interface UserProfileDto {
  address: string;
  total_tickets_bought: number;
  total_raffles_entered: number;
  total_raffles_won: number;
  total_prize_xlm: string;
  creator_stats?: {
    raffles_created: number;
    total_tickets_sold: number;
    total_xlm_raised: string;
    participant_win_rate: number;
  };
}

export interface UserLeaderboardEntryDto {
  rank: number;
  address: string;
  total_tickets_bought: number;
  total_raffles_won: number;
  total_prize_xlm: string;
  total_raffles_entered: number;
}

export interface UserLeaderboardResponseDto {
  data: UserLeaderboardEntryDto[];
  total: number;
  limit: number;
  offset: number;
}
