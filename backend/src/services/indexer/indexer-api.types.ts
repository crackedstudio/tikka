/**
 * Raw indexer HTTP API shapes.
 *
 * These types describe what the indexer service returns over the wire. They are
 * declared from the indexer's own controllers and DTOs
 * (`indexer/src/api/controllers/**`), which are the source of truth for the
 * indexer's HTTP API.
 *
 * IMPORTANT: These are the "indexer row shapes". Only modules inside this
 * directory (`backend/src/services/indexer/`) may import this file — see the
 * `no-indexer-row-shapes-outside-boundary` rule in `.dependency-cruiser.js` and
 * the "Backend ↔ indexer boundary" section of `docs/contributing/MODULE_BOUNDARIES.md`.
 * Consumers outside the boundary must use the backend-owned response types from
 * `./indexer.types` instead.
 */

/** Status values emitted by the indexer raffle entity. */
export type IndexerApiRaffleStatus =
  | 'open'
  | 'drawing'
  | 'finalized'
  | 'cancelled';

/** Item shape from GET /raffles and GET /raffles/:id. */
export interface IndexerApiRaffleListItem {
  id: number;
  creator: string;
  status: IndexerApiRaffleStatus;
  ticket_price: string;
  asset: string;
  max_tickets: number;
  tickets_sold: number;
  end_time: string;
  winner: string | null;
  prize_amount: string | null;
  metadata_cid: string | null;
  created_at: string;
}

/** Detail shape from GET /raffles/:id. */
export interface IndexerApiRaffleDetail extends IndexerApiRaffleListItem {
  winning_ticket_id: number | null;
  ticket_count: number;
}

/** Response shape from GET /raffles. */
export interface IndexerApiRaffleListResponse {
  data: IndexerApiRaffleListItem[];
  total: number;
  limit: number;
  offset: number;
}

/** Item shape from GET /users/:address/history. */
export interface IndexerApiUserHistoryItem extends IndexerApiRaffleListItem {
  user_tickets: number;
  won: boolean;
}

/** Response shape from GET /users/:address/history. */
export interface IndexerApiUserHistoryResponse {
  data: IndexerApiUserHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}

/** Creator aggregate shape nested in the user profile. */
export interface IndexerApiCreatorStats {
  raffles_created: number;
  total_tickets_sold: number;
  total_xlm_raised: string;
  participant_win_rate: number;
}

/** Profile shape from GET /users/:address. */
export interface IndexerApiUserProfile {
  address: string;
  total_tickets_bought: number;
  total_raffles_entered: number;
  total_raffles_won: number;
  total_prize_xlm: string;
  creator_stats?: IndexerApiCreatorStats;
}

/** Entry shape from GET /leaderboard. */
export interface IndexerApiLeaderboardEntry {
  rank: number | null;
  address: string;
  totalTicketsBought: number;
  totalRafflesWon: number;
  totalPrizeXlm: string;
}

/** Response shape from GET /leaderboard. */
export interface IndexerApiLeaderboardResponse {
  by: 'wins' | 'volume' | 'tickets';
  limit: number;
  offset: number | null;
  ranking: string[];
  entries: IndexerApiLeaderboardEntry[];
  nextCursor: string | null;
}

/** Stats shape from GET /stats/platform. */
export interface IndexerApiPlatformStats {
  date: string | null;
  total_raffles: number;
  total_tickets: number;
  total_volume_xlm: string;
  unique_participants: number;
  prizes_distributed_xlm: string;
  active_raffles: number;
  total_users: number;
}

/** Entry shape from GET /transparency. */
export interface IndexerApiTransparencyEntry {
  id: string;
  timestamp: string;
  raffle_id: number;
  request_id: string;
  oracle_id: string;
  seed: string;
  proof: string;
  tx_hash: string;
  method: 'VRF' | 'PRNG';
}

/** Response shape from GET /transparency. */
export interface IndexerApiTransparencyLog {
  entries: IndexerApiTransparencyEntry[];
  total: number;
}

/** Participant shape from GET /raffles/:id/participants. */
export interface IndexerApiParticipant {
  address: string;
  tickets_count: number;
  purchased_at: number;
}

/** Response shape from GET /raffles/:id/participants. */
export interface IndexerApiParticipantListResponse {
  participants: IndexerApiParticipant[];
  total: number;
  limit: number;
  offset: number;
}
