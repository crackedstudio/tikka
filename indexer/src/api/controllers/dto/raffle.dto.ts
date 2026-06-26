/**
 * Raffle DTOs — stable contracts for API responses.
 * Hide internal fields like createdLedger, finalizedLedger, lastTxHash.
 */

export interface RaffleListItemDto {
  id: number;
  creator: string;
  status: "open" | "drawing" | "finalized" | "cancelled";
  ticket_price: string;
  asset: string;
  max_tickets: number;
  tickets_sold: number;
  end_time: string;
  winner: string | null;
  prize_amount: string | null;
  metadata_cid: string | null;
  created_at: string; // ISO date string
}

export interface RaffleDetailDto extends RaffleListItemDto {
  winning_ticket_id: number | null;
  ticket_count: number;
}

export interface UserRaffleHistoryItemDto extends RaffleListItemDto {
  user_tickets: number;
  won: boolean;
}

export interface RaffleListResponseDto {
  data: RaffleListItemDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface UserRaffleHistoryResponseDto {
  data: UserRaffleHistoryItemDto[];
  total: number;
  limit: number;
  offset: number;
}
