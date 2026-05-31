/**
 * Leaderboard DTOs — cursor-based pagination with mode-based ranking.
 * Hide internal fields like firstSeenLedger (storage-only).
 * Hide raw cursor implementation - nextCursor is opaque to clients.
 */

export type LeaderboardMode = "wins" | "volume" | "tickets";

export interface LeaderboardEntryDto {
  rank: number | null;
  address: string;
  totalTicketsBought: number;
  totalRafflesWon: number;
  totalPrizeXlm: string;
}

export interface LeaderboardResponseDto {
  by: LeaderboardMode;
  limit: number;
  offset: number | null;
  ranking: string[];
  entries: LeaderboardEntryDto[];
  nextCursor: string | null;
}
