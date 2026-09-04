/**
 * Mappers translating raw indexer API shapes (`./indexer-api.types`) into
 * backend-owned response types (`./indexer.types`).
 *
 * This is the single boundary where indexer rows become backend responses. The
 * translation is pinned by `./indexer.mapper.spec`, so an indexer schema change
 * that alters the wire contract fails a backend test instead of silently
 * changing an API response.
 *
 * Mappers are lossless with respect to the backend contract: every field the
 * indexer sends that the backend exposes is carried through explicitly, and
 * fields the indexer does not send are left undefined so the response remains
 * deterministic.
 */
import type {
  IndexerApiLeaderboardEntry,
  IndexerApiLeaderboardResponse,
  IndexerApiParticipant,
  IndexerApiParticipantListResponse,
  IndexerApiPlatformStats,
  IndexerApiRaffleDetail,
  IndexerApiRaffleListItem,
  IndexerApiRaffleListResponse,
  IndexerApiTransparencyEntry,
  IndexerApiTransparencyLog,
  IndexerApiUserHistoryItem,
  IndexerApiUserHistoryResponse,
  IndexerApiUserProfile,
} from './indexer-api.types';
import type {
  IndexerLeaderboardEntry,
  IndexerLeaderboardResponse,
  IndexerParticipant,
  IndexerParticipantListResponse,
  IndexerPlatformStats,
  IndexerRaffleData,
  IndexerRaffleListItem,
  IndexerListRafflesResponse,
  IndexerTransparencyEntry,
  IndexerTransparencyLog,
  IndexerUserData,
  IndexerUserHistoryItem,
  IndexerUserHistoryResponse,
} from './indexer.types';

/** Map a single raffle list item from the indexer wire shape. */
export function mapRaffleListItem(raw: IndexerApiRaffleListItem): IndexerRaffleListItem {
  return {
    id: raw.id,
    creator: raw.creator,
    status: raw.status,
    ticket_price: raw.ticket_price,
    asset: raw.asset,
    max_tickets: raw.max_tickets,
    tickets_sold: raw.tickets_sold,
    end_time: raw.end_time,
    winner: raw.winner,
    prize_amount: raw.prize_amount,
    metadata_cid: raw.metadata_cid,
    created_at: raw.created_at,
  };
}

/** Map a raffle detail from the indexer wire shape. */
export function mapRaffleDetail(raw: IndexerApiRaffleDetail): IndexerRaffleData {
  const base = mapRaffleListItem(raw);
  const detail: IndexerRaffleData = { ...base };
  // The indexer detail response does not include these fields; they are kept
  // as optional on the backend type so older/newer indexer versions can supply
  // them without breaking the API contract.
  return detail;
}

/** Map the raffle list response from the indexer wire shape. */
export function mapRaffleList(raw: IndexerApiRaffleListResponse): IndexerListRafflesResponse {
  return {
    raffles: (raw.data ?? []).map(mapRaffleListItem),
    total: raw.total,
  };
}

/** Map a user profile from the indexer wire shape. */
export function mapUserProfile(raw: IndexerApiUserProfile): IndexerUserData {
  return {
    address: raw.address,
    total_tickets_bought: raw.total_tickets_bought,
    total_raffles_entered: raw.total_raffles_entered,
    total_raffles_won: raw.total_raffles_won,
    total_prize_xlm: raw.total_prize_xlm,
    creator_stats: raw.creator_stats,
  };
}

/** Map a single user history item from the indexer wire shape. */
export function mapUserHistoryItem(raw: IndexerApiUserHistoryItem): IndexerUserHistoryItem {
  return {
    raffle_id: raw.id,
    status: raw.status,
    tickets_bought: raw.user_tickets,
    prize_amount: raw.prize_amount,
    is_winner: raw.won,
  };
}

/** Map the user history response from the indexer wire shape. */
export function mapUserHistory(raw: IndexerApiUserHistoryResponse): IndexerUserHistoryResponse {
  return {
    items: (raw.data ?? []).map(mapUserHistoryItem),
    total: raw.total,
  };
}

/** Map a single leaderboard entry from the indexer wire shape. */
export function mapLeaderboardEntry(raw: IndexerApiLeaderboardEntry): IndexerLeaderboardEntry {
  return {
    address: raw.address,
    total_tickets: raw.totalTicketsBought,
    total_wins: raw.totalRafflesWon,
    total_volume_xlm: raw.totalPrizeXlm,
    rank: raw.rank ?? undefined,
  };
}

/** Map the leaderboard response from the indexer wire shape. */
export function mapLeaderboard(raw: IndexerApiLeaderboardResponse): IndexerLeaderboardResponse {
  return {
    entries: (raw.entries ?? []).map(mapLeaderboardEntry),
    nextCursor: raw.nextCursor,
  };
}

/** Map platform stats from the indexer wire shape. */
export function mapPlatformStats(raw: IndexerApiPlatformStats): IndexerPlatformStats {
  return {
    date: raw.date,
    total_raffles: raw.total_raffles,
    total_tickets: raw.total_tickets,
    total_volume_xlm: raw.total_volume_xlm,
    unique_participants: raw.unique_participants,
    prizes_distributed_xlm: raw.prizes_distributed_xlm,
  };
}

/** Map a single transparency entry from the indexer wire shape. */
export function mapTransparencyEntry(raw: IndexerApiTransparencyEntry): IndexerTransparencyEntry {
  return {
    id: raw.id,
    timestamp: raw.timestamp,
    raffle_id: raw.raffle_id,
    request_id: raw.request_id,
    oracle_id: raw.oracle_id,
    seed: raw.seed,
    proof: raw.proof,
    tx_hash: raw.tx_hash,
    method: raw.method,
  };
}

/** Map the transparency log response from the indexer wire shape. */
export function mapTransparencyLog(raw: IndexerApiTransparencyLog): IndexerTransparencyLog {
  return {
    entries: (raw.entries ?? []).map(mapTransparencyEntry),
    total: raw.total,
  };
}

/** Map a single participant from the indexer wire shape. */
export function mapParticipant(raw: IndexerApiParticipant): IndexerParticipant {
  return {
    address: raw.address,
    tickets_count: raw.tickets_count,
    purchased_at: raw.purchased_at,
  };
}

/** Map the participant list response from the indexer wire shape. */
export function mapParticipants(
  raw: IndexerApiParticipantListResponse,
): IndexerParticipantListResponse {
  return {
    participants: (raw.participants ?? []).map(mapParticipant),
    total: raw.total,
    limit: raw.limit,
    offset: raw.offset,
  };
}
