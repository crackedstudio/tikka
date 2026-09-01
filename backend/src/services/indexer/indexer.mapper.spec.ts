/**
 * Mapper tests — pin the translation of raw indexer API shapes into
 * backend-owned response types.
 *
 * The fixtures below model the indexer's actual wire responses (see
 * `indexer/src/api/controllers/**` and its DTOs). If an indexer schema change
 * alters one of these shapes, updating the raw type or the mapper must come
 * with a matching update here — otherwise the backend test suite fails instead
 * of an API consumer seeing a silently changed response.
 */
import {
  mapLeaderboard,
  mapLeaderboardEntry,
  mapParticipant,
  mapParticipants,
  mapPlatformStats,
  mapRaffleDetail,
  mapRaffleList,
  mapRaffleListItem,
  mapTransparencyEntry,
  mapTransparencyLog,
  mapUserHistory,
  mapUserHistoryItem,
  mapUserProfile,
} from './indexer.mapper';
import type {
  IndexerApiLeaderboardResponse,
  IndexerApiParticipantListResponse,
  IndexerApiPlatformStats,
  IndexerApiRaffleDetail,
  IndexerApiRaffleListResponse,
  IndexerApiTransparencyLog,
  IndexerApiUserHistoryResponse,
  IndexerApiUserProfile,
} from './indexer-api.types';

const ADDRESS_A = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const ADDRESS_B = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBWB4';

// ── Raffles ───────────────────────────────────────────────────────────────────

const raffleDetailFixture: IndexerApiRaffleDetail = {
  id: 42,
  creator: ADDRESS_A,
  status: 'open',
  ticket_price: '100',
  asset: 'XLM',
  max_tickets: 100,
  tickets_sold: 17,
  end_time: '2030-01-01T00:00:00.000Z',
  winner: null,
  winning_ticket_id: null,
  prize_amount: null,
  metadata_cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
  created_at: '2026-01-01T00:00:00.000Z',
  ticket_count: 17,
};

describe('mapRaffleListItem', () => {
  it('maps every indexer field onto the backend-owned list item', () => {
    expect(mapRaffleListItem(raffleDetailFixture)).toEqual({
      id: 42,
      creator: ADDRESS_A,
      status: 'open',
      ticket_price: '100',
      asset: 'XLM',
      max_tickets: 100,
      tickets_sold: 17,
      end_time: '2030-01-01T00:00:00.000Z',
      winner: null,
      prize_amount: null,
      metadata_cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
      created_at: '2026-01-01T00:00:00.000Z',
    });
  });
});

describe('mapRaffleDetail', () => {
  it('drops indexer-only detail fields and does not invent contract fields', () => {
    const mapped = mapRaffleDetail(raffleDetailFixture);

    expect(mapped.id).toBe(42);
    expect(mapped.created_ledger).toBeUndefined();
    expect(mapped.finalized_ledger).toBeUndefined();
    expect((mapped as unknown as Record<string, unknown>).winning_ticket_id).toBeUndefined();
    expect((mapped as unknown as Record<string, unknown>).ticket_count).toBeUndefined();
    // Detail fields the indexer does send must survive translation.
    expect(mapped.tickets_sold).toBe(17);
    expect(mapped.winner).toBeNull();
  });
});

const raffleListFixture: IndexerApiRaffleListResponse = {
  data: [
    { ...raffleDetailFixture, id: 1, tickets_sold: 3 },
    { ...raffleDetailFixture, id: 2, tickets_sold: 9 },
  ],
  total: 2,
  limit: 20,
  offset: 0,
};

describe('mapRaffleList', () => {
  it('maps the indexer `data` array onto the backend-owned `raffles` contract', () => {
    const mapped = mapRaffleList(raffleListFixture);

    expect(mapped).toEqual({
      raffles: [
        expect.objectContaining({ id: 1, tickets_sold: 3 }),
        expect.objectContaining({ id: 2, tickets_sold: 9 }),
      ],
      total: 2,
    });
    // Pagination metadata that belongs to the indexer is not leaked.
    expect((mapped as unknown as Record<string, unknown>).limit).toBeUndefined();
    expect((mapped as unknown as Record<string, unknown>).offset).toBeUndefined();
  });

  it('tolerates an absent `data` array', () => {
    expect(mapRaffleList({ data: undefined as unknown as [], total: 0, limit: 0, offset: 0 })).toEqual({
      raffles: [],
      total: 0,
    });
  });
});

// ── Users ─────────────────────────────────────────────────────────────────────

const userProfileFixture: IndexerApiUserProfile = {
  address: ADDRESS_A,
  total_tickets_bought: 25,
  total_raffles_entered: 4,
  total_raffles_won: 1,
  total_prize_xlm: '1000',
  creator_stats: {
    raffles_created: 2,
    total_tickets_sold: 500,
    total_xlm_raised: '50000',
    participant_win_rate: 12.5,
  },
};

describe('mapUserProfile', () => {
  it('maps the profile fields onto the backend-owned contract', () => {
    expect(mapUserProfile(userProfileFixture)).toEqual({
      address: ADDRESS_A,
      total_tickets_bought: 25,
      total_raffles_entered: 4,
      total_raffles_won: 1,
      total_prize_xlm: '1000',
      creator_stats: {
        raffles_created: 2,
        total_tickets_sold: 500,
        total_xlm_raised: '50000',
        participant_win_rate: 12.5,
      },
    });
  });

  it('leaves first_seen_ledger / updated_at undefined when the indexer omits them', () => {
    const mapped = mapUserProfile(userProfileFixture);
    expect(mapped.first_seen_ledger).toBeUndefined();
    expect(mapped.updated_at).toBeUndefined();
  });
});

const userHistoryFixture: IndexerApiUserHistoryResponse = {
  data: [
    {
      id: 42,
      creator: ADDRESS_A,
      status: 'finalized',
      ticket_price: '100',
      asset: 'XLM',
      max_tickets: 100,
      tickets_sold: 100,
      end_time: '2026-02-01T00:00:00.000Z',
      winner: ADDRESS_A,
      prize_amount: '10000',
      metadata_cid: null,
      created_at: '2026-01-01T00:00:00.000Z',
      user_tickets: 5,
      won: true,
    },
  ],
  total: 1,
  limit: 20,
  offset: 0,
};

describe('mapUserHistoryItem / mapUserHistory', () => {
  it('maps the indexer history item onto the backend-owned shape', () => {
    expect(mapUserHistoryItem(userHistoryFixture.data[0])).toEqual({
      raffle_id: 42,
      status: 'finalized',
      tickets_bought: 5,
      prize_amount: '10000',
      is_winner: true,
    });
  });

  it('maps the indexer `data` array onto the backend-owned `items` contract', () => {
    const mapped = mapUserHistory(userHistoryFixture);
    expect(mapped.items).toHaveLength(1);
    expect(mapped.items[0]).toMatchObject({ raffle_id: 42, tickets_bought: 5, is_winner: true });
    expect(mapped.total).toBe(1);
  });
});

// ── Leaderboard ───────────────────────────────────────────────────────────────

const leaderboardFixture: IndexerApiLeaderboardResponse = {
  by: 'wins',
  limit: 20,
  offset: 0,
  ranking: ['totalRafflesWon desc', 'totalPrizeXlm numeric desc'],
  entries: [
    { rank: 1, address: ADDRESS_A, totalTicketsBought: 25, totalRafflesWon: 3, totalPrizeXlm: '3000' },
    { rank: 2, address: ADDRESS_B, totalTicketsBought: 10, totalRafflesWon: 1, totalPrizeXlm: '500' },
  ],
  nextCursor: null,
};

describe('mapLeaderboardEntry / mapLeaderboard', () => {
  it('maps the indexer camelCase entries onto the snake_case contract', () => {
    expect(mapLeaderboardEntry(leaderboardFixture.entries[0])).toEqual({
      address: ADDRESS_A,
      total_tickets: 25,
      total_wins: 3,
      total_volume_xlm: '3000',
      rank: 1,
    });
  });

  it('maps null rank to an omitted rank', () => {
    expect(
      mapLeaderboardEntry({ ...leaderboardFixture.entries[0], rank: null }).rank,
    ).toBeUndefined();
  });

  it('maps the leaderboard response and keeps only the backend-owned fields', () => {
    const mapped = mapLeaderboard(leaderboardFixture);

    expect(mapped.entries).toHaveLength(2);
    expect(mapped.entries[1]).toEqual({
      address: ADDRESS_B,
      total_tickets: 10,
      total_wins: 1,
      total_volume_xlm: '500',
      rank: 2,
    });
    expect(mapped.nextCursor).toBeNull();
    // Indexer-only fields (by/limit/offset/ranking) must not leak.
    expect((mapped as unknown as Record<string, unknown>).by).toBeUndefined();
    expect((mapped as unknown as Record<string, unknown>).limit).toBeUndefined();
    expect((mapped as unknown as Record<string, unknown>).ranking).toBeUndefined();
  });
});

// ── Platform stats ────────────────────────────────────────────────────────────

const platformStatsFixture: IndexerApiPlatformStats = {
  date: '2026-08-01',
  total_raffles: 120,
  total_tickets: 4500,
  total_volume_xlm: '450000',
  unique_participants: 320,
  prizes_distributed_xlm: '180000',
  active_raffles: 14,
  total_users: 210,
};

describe('mapPlatformStats', () => {
  it('maps the platform stats and drops indexer-only aggregates', () => {
    const mapped = mapPlatformStats(platformStatsFixture);

    expect(mapped).toEqual({
      date: '2026-08-01',
      total_raffles: 120,
      total_tickets: 4500,
      total_volume_xlm: '450000',
      unique_participants: 320,
      prizes_distributed_xlm: '180000',
    });
    expect((mapped as unknown as Record<string, unknown>).active_raffles).toBeUndefined();
    expect((mapped as unknown as Record<string, unknown>).total_users).toBeUndefined();
  });

  it('preserves a nullable date', () => {
    expect(mapPlatformStats({ ...platformStatsFixture, date: null }).date).toBeNull();
  });
});

// ── Transparency log ──────────────────────────────────────────────────────────

const transparencyFixture: IndexerApiTransparencyLog = {
  entries: [
    {
      id: 't-1',
      timestamp: '2026-08-01T12:00:00.000Z',
      raffle_id: 42,
      request_id: 'req-1',
      oracle_id: 'oracle-1',
      seed: 'a1b2c3',
      proof: 'deadbeef',
      tx_hash: 'abc123',
      method: 'VRF',
    },
  ],
  total: 1,
};

describe('mapTransparencyEntry / mapTransparencyLog', () => {
  it('maps the transparency entry field-for-field', () => {
    expect(mapTransparencyEntry(transparencyFixture.entries[0])).toEqual(
      transparencyFixture.entries[0],
    );
  });

  it('maps the log response', () => {
    expect(mapTransparencyLog(transparencyFixture)).toEqual({
      entries: [transparencyFixture.entries[0]],
      total: 1,
    });
  });
});

// ── Participants ──────────────────────────────────────────────────────────────

const participantsFixture: IndexerApiParticipantListResponse = {
  participants: [
    { address: ADDRESS_A, tickets_count: 5, purchased_at: 1710000000 },
    { address: ADDRESS_B, tickets_count: 1, purchased_at: 1710000100 },
  ],
  total: 2,
  limit: 20,
  offset: 0,
};

describe('mapParticipant / mapParticipants', () => {
  it('maps a participant field-for-field', () => {
    expect(mapParticipant(participantsFixture.participants[0])).toEqual({
      address: ADDRESS_A,
      tickets_count: 5,
      purchased_at: 1710000000,
    });
  });

  it('maps the participant list response', () => {
    expect(mapParticipants(participantsFixture)).toEqual({
      participants: [
        { address: ADDRESS_A, tickets_count: 5, purchased_at: 1710000000 },
        { address: ADDRESS_B, tickets_count: 1, purchased_at: 1710000100 },
      ],
      total: 2,
      limit: 20,
      offset: 0,
    });
  });
});
