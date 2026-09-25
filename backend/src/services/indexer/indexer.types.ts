/**
 * Backend-owned response types for indexer-sourced data.
 *
 * These types are the *backend's* public contract: the shapes that
 * `IndexerService` returns and that controllers (and through them the client)
 * consume. They are deliberately decoupled from the raw indexer wire shapes in
 * `./indexer-api.types` — the indexer may rename or reshape its API without
 * leaking into backend responses, because the translation happens once, in
 * `./indexer.mapper`, and is pinned by `./indexer.mapper.spec`.
 *
 * Consumers outside `backend/src/services/indexer/` must import from this file
 * (or re-exports of it), never from `./indexer-api.types`.
 */

/** Raffle contract data sourced from the indexer. */
export interface IndexerRaffleData {
  id: number;
  creator: string;
  status: string;
  ticket_price: string;
  asset: string;
  max_tickets: number;
  tickets_sold: number;
  end_time: string;
  winner: string | null;
  prize_amount: string | null;
  /**
   * Ledger that created the raffle. Present only when the indexer API version
   * provides it; omitted (undefined) on indexer responses that do not.
   */
  created_ledger?: number;
  /**
   * Ledger at which the raffle was finalized/cancelled. Present only when the
   * indexer API version provides it; omitted (undefined) otherwise.
   */
  finalized_ledger?: number | null;
  metadata_cid: string | null;
  created_at: string;
}

/** Raffle list item: raffle data plus optional derived participant count. */
export interface IndexerRaffleListItem extends IndexerRaffleData {
  participant_count?: number;
}

/** Filters accepted by the raffle list endpoint. */
export interface IndexerListRafflesFilters {
  status?: string;
  category?: string;
  creator?: string;
  asset?: string;
  limit?: number;
  offset?: number;
}

/** Response returned by the raffle list endpoint. */
export interface IndexerListRafflesResponse {
  raffles: IndexerRaffleListItem[];
  total?: number;
}

/** Freshness metadata for raffle data integration. */
export interface RaffleFreshness {
  /** ISO timestamp when raffle was last indexed from blockchain */
  indexedAt: string | null;

  /** ISO timestamp when data source was last updated */
  sourceUpdatedAt: string;

  /** Ledger height at which raffle state was confirmed */
  ledger?: number;

  /** If metadata is newer than indexed state, flag for client */
  staleness?: {
    metadataNewer: boolean;
    minutesOld: number;
  };

  /** Conflict resolution log (only if conflicts detected) */
  conflict?: {
    field: string;
    metadataValue: any;
    indexerValue: any;
    resolution: 'indexer_authoritative' | 'metadata_authoritative' | 'merged';
  };

  /** Warning message for clients */
  warning?: string;
}

/** Supabase raffle metadata (off-chain). */
export interface RaffleMetadata {
  raffle_id: number;
  title: string;
  description: string;
  image_url: string | null;
  image_urls: string[] | null;
  category: string | null;
  metadata_cid: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Combined raffle response with freshness context. */
export interface RaffleWithFreshness extends IndexerRaffleData {
  freshness: RaffleFreshness;
  title?: string;
  description?: string;
  image_url?: string | null;
  image_urls?: string[] | null;
  category?: string | null;
}

/** User participation profile sourced from the indexer. */
export interface IndexerUserData {
  address: string;
  total_tickets_bought: number;
  total_raffles_entered: number;
  total_raffles_won: number;
  total_prize_xlm: string;
  /**
   * Ledger at which the user was first seen. Present only when the indexer API
   * version provides it; omitted (undefined) otherwise.
   */
  first_seen_ledger?: number;
  /**
   * Timestamp of the last indexer update. Present only when the indexer API
   * version provides it; omitted (undefined) otherwise.
   */
  updated_at?: string;
  creator_stats?: {
    raffles_created: number;
    total_tickets_sold: number;
    total_xlm_raised: string;
    participant_win_rate: number;
  };
}

/** Single raffle participation entry in a user's history. */
export interface IndexerUserHistoryItem {
  raffle_id: number;
  status: string;
  tickets_bought: number;
  /**
   * Ledger of the user's first purchase in this raffle. Present only when the
   * indexer API version provides it; omitted (undefined) otherwise.
   */
  purchased_at_ledger?: number;
  /**
   * Transaction hash of the purchase. Present only when the indexer API version
   * provides it; omitted (undefined) otherwise.
   */
  purchase_tx_hash?: string;
  prize_amount: string | null;
  is_winner: boolean;
}

/** Response returned by the user history endpoint. */
export interface IndexerUserHistoryResponse {
  items: IndexerUserHistoryItem[];
  total: number;
}

/** Entry in the leaderboard. */
export interface IndexerLeaderboardEntry {
  address: string;
  total_tickets?: number;
  total_wins?: number;
  total_volume_xlm?: string;
  rank?: number;
}

/** Response returned by the leaderboard endpoint. */
export interface IndexerLeaderboardResponse {
  entries: IndexerLeaderboardEntry[];
  nextCursor?: string | null;
}

export type LeaderboardSortBy = 'wins' | 'volume' | 'tickets';

/** Filters accepted by the leaderboard endpoint. */
export interface IndexerLeaderboardFilters {
  by?: LeaderboardSortBy;
  limit?: number;
  cursor?: string;
  offset?: number;
}

/** Daily platform aggregate stats. */
export interface IndexerPlatformStats {
  date: string | null;
  total_raffles: number;
  total_tickets: number;
  total_volume_xlm: string;
  unique_participants: number;
  prizes_distributed_xlm: string;
}

/** Single VRF/PRNG audit-log entry. */
export interface IndexerTransparencyEntry {
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

/** Response returned by the transparency log endpoint. */
export interface IndexerTransparencyLog {
  entries: IndexerTransparencyEntry[];
  total: number;
}

/** Participant (ticket holder) of a raffle. */
export interface IndexerParticipant {
  address: string;
  tickets_count: number;
  purchased_at: number;
}

/** Response returned by the raffle participants endpoint. */
export interface IndexerParticipantListResponse {
  participants: IndexerParticipant[];
  total: number;
  limit: number;
  offset: number;
}

/** Error raised when an indexer HTTP request fails. */
export class IndexerError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'IndexerError';
  }
}
