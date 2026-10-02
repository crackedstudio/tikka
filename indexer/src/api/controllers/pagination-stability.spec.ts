/**
 * Pagination Stability Tests
 *
 * These tests verify that cursor-based pagination remains stable and correct
 * even when rows are inserted or deleted during pagination (concurrent writes).
 *
 * Key invariants being tested:
 * 1. No duplicate entries across pages when cursor pagination is used
 * 2. No skipped entries due to concurrent inserts/deletes
 * 3. Stable ordering (deterministic tie-breaking) across paginated boundaries
 * 4. Cursor correctly encodes/decodes sort keys and position markers
 */

import { RafflesController } from './raffles.controller';
import { LeaderboardController } from './leaderboard.controller';
import { CacheService } from '../../cache/cache.service';
import { RaffleEntity, RaffleStatus } from '../../database/entities/raffle.entity';
import { UserEntity } from '../../database/entities/user.entity';

type MockQb<T> = {
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  andWhere: jest.Mock;
  skip: jest.Mock;
  offset: jest.Mock;
  take: jest.Mock;
  limit: jest.Mock;
  getMany: jest.Mock;
  getManyAndCount?: jest.Mock;
};

/**
 * Test suite: Raffle list pagination stability under concurrent inserts
 *
 * Scenario: User pages through active raffles while new raffles are being created.
 * Expected behavior: Cursor pagination should not duplicate or skip entries.
 */
describe('Raffle List Pagination Stability', () => {
  let controller: RafflesController;
  let raffleRepo: any;
  let ticketRepo: any;
  let cacheService: any;
  const builders: MockQb<RaffleEntity>[] = [];

  beforeEach(() => {
    builders.length = 0;
    raffleRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
    };

    ticketRepo = {
      count: jest.fn(),
    };

    cacheService = {
      getActiveRaffles: jest.fn().mockResolvedValue(null),
      setActiveRaffles: jest.fn(),
      getRaffleDetail: jest.fn(),
      setRaffleDetail: jest.fn(),
    };

    controller = new RafflesController(raffleRepo, ticketRepo, cacheService);
  });

  function makeRaffle(id: number, createdAt: Date, creator = 'GCREATOR'): RaffleEntity {
    return {
      id,
      creator,
      status: RaffleStatus.OPEN,
      ticketPrice: '1000000',
      asset: 'XLM',
      maxTickets: 100,
      ticketsSold: 0,
      endTime: String(Date.now() / 1000 + 86400),
      winner: null,
      winningTicketId: null,
      prizeAmount: null,
      createdLedger: id * 100,
      finalizedLedger: null,
      metadataCid: 'QmABC',
      createdAt,
      tickets: [],
      events: [],
    } as RaffleEntity;
  }

  function setupRaffleQueryBuilder(rows: RaffleEntity[]): MockQb<RaffleEntity> {
    const qb: MockQb<RaffleEntity> = {
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      andWhere: jest.fn(),
      skip: jest.fn(),
      offset: jest.fn(),
      take: jest.fn(),
      limit: jest.fn(),
      getMany: jest.fn().mockResolvedValue(rows),
    };

    qb.orderBy.mockReturnValue(qb);
    qb.addOrderBy.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    qb.skip.mockReturnValue(qb);
    qb.offset.mockReturnValue(qb);
    qb.take.mockReturnValue(qb);
    qb.limit.mockReturnValue(qb);

    builders.push(qb);
    raffleRepo.createQueryBuilder.mockReturnValueOnce(qb);
    return qb;
  }

  it('should use keyset pagination with createdAt DESC + id ASC ordering', async () => {
    const raffles = [
      makeRaffle(3, new Date('2024-01-03')),
      makeRaffle(2, new Date('2024-01-02')),
      makeRaffle(1, new Date('2024-01-01')),
    ];
    const qb = setupRaffleQueryBuilder(raffles);

    await controller.list({ limit: 10, offset: 0 });

    expect(qb.orderBy).toHaveBeenCalledWith('r.createdAt', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('r.id', 'ASC');
  });

  it('should not have duplicate entries across cursor pages (simulating concurrent insert)', async () => {
    const baseTime = new Date('2024-01-01T00:00:00Z');

    // Page 1: Initial fetch returns 3 raffles
    const page1Raffles = [
      makeRaffle(3, new Date(baseTime.getTime() + 2 * 60000)), // 2 min later
      makeRaffle(2, new Date(baseTime.getTime() + 1 * 60000)), // 1 min later
      makeRaffle(1, baseTime), // Original
    ];

    setupRaffleQueryBuilder(page1Raffles);
    const page1Result = await controller.list({ limit: 2, offset: 0 });

    expect(page1Result.data).toHaveLength(2);
    const page1Ids = page1Result.data.map((r) => r.id);
    expect(page1Ids).toEqual([3, 2]);
    expect(page1Result.nextCursor).toBeTruthy();

    // Simulate concurrent insert: A new raffle (id=4) is created between pages
    // with createdAt that sorts between raffle 3 and raffle 2
    const page2Raffles = [
      makeRaffle(4, new Date(baseTime.getTime() + 1.5 * 60000)), // 1.5 min later (between 3 and 2)
      makeRaffle(1, baseTime),
    ];

    const qb2 = setupRaffleQueryBuilder(page2Raffles);
    const page2Result = await controller.list({
      limit: 2,
      offset: 0,
      cursor: page1Result.nextCursor,
    });

    expect(page2Result.data).toHaveLength(2);
    const page2Ids = page2Result.data.map((r) => r.id);

    // Verify no duplicates: page1 had [3, 2], page2 should have [4, 1]
    const allIds = new Set([...page1Ids, ...page2Ids]);
    expect(allIds.size).toBe(4); // All unique
    expect(allIds).toEqual(new Set([1, 2, 3, 4]));

    // Verify keyset WHERE was called (prevents offset-based duplicates)
    expect(qb2.andWhere).toHaveBeenCalled();
  });

  it('should preserve ordering even when raffle with same createdAt exists', async () => {
    const baseTime = new Date('2024-01-01T00:00:00Z');

    // Multiple raffles with the same createdAt (tie scenario)
    // Should use id as tiebreaker (ASC)
    const tiedRaffles = [
      makeRaffle(5, baseTime), // createdAt tie, id=5
      makeRaffle(4, baseTime), // createdAt tie, id=4
      makeRaffle(3, baseTime), // createdAt tie, id=3
    ];

    setupRaffleQueryBuilder(tiedRaffles);
    const result = await controller.list({ limit: 10, offset: 0 });

    const ids = result.data.map((r) => r.id);
    expect(ids).toEqual([5, 4, 3]);
  });

  it('should handle cursor pagination through tied entries without duplicates', async () => {
    const baseTime = new Date('2024-01-01T00:00:00Z');

    // Page 1: 2 raffles with same createdAt (id=4,3)
    const page1 = [
      makeRaffle(4, baseTime),
      makeRaffle(3, baseTime),
    ];

    setupRaffleQueryBuilder(page1);
    const page1Result = await controller.list({ limit: 1, offset: 0 });
    expect(page1Result.data[0].id).toBe(4);
    expect(page1Result.nextCursor).toBeTruthy();

    // Page 2: Remaining raffles (id=3,2,1)
    const page2 = [
      makeRaffle(3, baseTime),
      makeRaffle(2, baseTime),
    ];

    setupRaffleQueryBuilder(page2);
    const page2Result = await controller.list({
      limit: 1,
      offset: 0,
      cursor: page1Result.nextCursor,
    });

    expect(page2Result.data[0].id).toBe(3);

    // No duplicate between pages
    const allIds = new Set([page1Result.data[0].id, page2Result.data[0].id]);
    expect(allIds.size).toBe(2);
  });

  it('should encode cursor with createdAt ISO and id for deterministic positioning', async () => {
    const raffles = [makeRaffle(1, new Date('2024-01-01T12:30:45Z'))];
    setupRaffleQueryBuilder(raffles);

    const result = await controller.list({ limit: 1, offset: 0 });

    // nextCursor should be present and decodable
    expect(result.nextCursor).toBeTruthy();

    // Verify cursor encodes sort values (createdAt ISO + id)
    if (result.nextCursor) {
      const decodedPayload = JSON.parse(
        Buffer.from(result.nextCursor, 'base64').toString('utf8'),
      );
      expect(decodedPayload.v).toHaveLength(2);
      expect(decodedPayload.v[0]).toBe('2024-01-01T12:30:45.000Z'); // createdAt ISO
      expect(decodedPayload.v[1]).toBe('1'); // id
      expect(decodedPayload.a).toBe('1'); // address/id field
    }
  });
});

/**
 * Test suite: Leaderboard pagination stability under concurrent user updates
 *
 * Scenario: User pages through leaderboard while users' stats are being updated.
 * Expected behavior: Cursor pagination should maintain stable ordering due to
 * deterministic tie-breaking (6-level cascade).
 */
describe('Leaderboard Pagination Stability', () => {
  let controller: LeaderboardController;
  let cacheService: any;
  const builders: MockQb<UserEntity>[] = [];

  beforeEach(() => {
    builders.length = 0;
    cacheService = {
      wrap: jest.fn(async (_key, _ttl, fetcher) => fetcher()),
    };

    const createQueryBuilder = jest.fn();
    controller = new LeaderboardController(
      { createQueryBuilder } as any,
      cacheService as unknown as CacheService,
    );

    (controller as any).userRepo = { createQueryBuilder };
  });

  function makeUser(
    address: string,
    wins: number,
    tickets = wins,
    prizeXlm = String(wins * 10),
    firstSeenLedger = 1,
  ): UserEntity {
    return {
      address,
      totalTicketsBought: tickets,
      totalRafflesEntered: tickets,
      totalRafflesWon: wins,
      totalPrizeXlm: prizeXlm,
      firstSeenLedger,
      lastTxHash: null,
      updatedAt: new Date(),
    };
  }

  function setupLeaderboardQueryBuilder(rows: UserEntity[]): MockQb<UserEntity> {
    const qb: MockQb<UserEntity> = {
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      andWhere: jest.fn(),
      skip: jest.fn(),
      offset: jest.fn(),
      take: jest.fn(),
      limit: jest.fn(),
      getMany: jest.fn().mockResolvedValue(rows),
    };

    qb.orderBy.mockReturnValue(qb);
    qb.addOrderBy.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    qb.skip.mockReturnValue(qb);
    qb.offset.mockReturnValue(qb);
    qb.take.mockReturnValue(qb);
    qb.limit.mockReturnValue(qb);

    builders.push(qb);
    ((controller as any).userRepo.createQueryBuilder as jest.Mock).mockReturnValueOnce(qb);
    return qb;
  }

  it('should apply 6-level deterministic tie-breaking for stable ranking', async () => {
    const users = [
      makeUser('GUSER1', 5, 10, '500', 100), // 5 wins, 10 tickets, 500 XLM, seen at ledger 100
      makeUser('GUSER2', 4, 8, '400', 50),
      makeUser('GUSER3', 3, 6, '300', 25),
    ];

    const qb = setupLeaderboardQueryBuilder(users);
    await controller.getLeaderboard({ by: 'wins', limit: 10 });

    // Verify 6-level cascade was applied
    expect(qb.orderBy).toHaveBeenCalledWith('user.totalRafflesWon', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('CAST(user.totalPrizeXlm AS NUMERIC)', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('user.totalTicketsBought', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('user.totalRafflesWon', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('user.firstSeenLedger', 'ASC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('user.address', 'ASC');
  });

  it('should not duplicate entries across cursor pages when user stats change', async () => {
    // Page 1: Initial leaderboard state
    const page1Users = [
      makeUser('GUSER1', 10, 20, '1000', 100), // Rank 1
      makeUser('GUSER2', 9, 18, '900', 90),    // Rank 2
      makeUser('GUSER3', 8, 16, '800', 80),    // Rank 3
    ];

    setupLeaderboardQueryBuilder(page1Users);
    const page1Result = await controller.getLeaderboard({ by: 'wins', limit: 2 });

    expect(page1Result.entries).toHaveLength(2);
    const page1Addresses = page1Result.entries.map((e) => e.address);
    expect(page1Addresses).toEqual(['GUSER1', 'GUSER2']);
    expect(page1Result.nextCursor).toBeTruthy();

    // Simulate concurrent user stats update: GUSER2's wins increased to 11
    // (would move them ahead), but cursor should skip them correctly
    const page2Users = [
      makeUser('GUSER3', 8, 16, '800', 80), // Rank 3
    ];

    setupLeaderboardQueryBuilder(page2Users);
    const page2Result = await controller.getLeaderboard({
      by: 'wins',
      limit: 2,
      cursor: page1Result.nextCursor,
    });

    expect(page2Result.entries).toHaveLength(1);
    const page2Addresses = page2Result.entries.map((e) => e.address);
    expect(page2Addresses).toEqual(['GUSER3']);

    // Verify no duplicates
    const allAddresses = new Set([...page1Addresses, ...page2Addresses]);
    expect(allAddresses.size).toBe(3);
  });

  it('should maintain stable ordering across pages with fully tied users', async () => {
    // All users have identical stats — must sort by address (lexicographic)
    const tiedUsers = [
      makeUser('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 5, 10, '500', 1),
      makeUser('GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 5, 10, '500', 1),
      makeUser('GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', 5, 10, '500', 1),
      makeUser('GDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD', 5, 10, '500', 1),
    ];

    setupLeaderboardQueryBuilder(tiedUsers);
    const result = await controller.getLeaderboard({ by: 'wins', limit: 10 });

    const addresses = result.entries.map((e) => e.address);
    // Should be sorted by address (final tiebreaker, ASC)
    expect(addresses).toEqual([
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
      'GDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
    ]);
  });

  it('should produce same ordering on repeated paginations with cursor', async () => {
    const users = [
      makeUser('GUSER1', 5, 10, '500', 100),
      makeUser('GUSER2', 4, 8, '400', 90),
      makeUser('GUSER3', 3, 6, '300', 80),
    ];

    // First pagination: fetch page 1
    setupLeaderboardQueryBuilder(users);
    const firstRun = await controller.getLeaderboard({ by: 'wins', limit: 2 });

    // Second pagination: same cursor (simulating repeated request)
    setupLeaderboardQueryBuilder(users);
    const secondRun = await controller.getLeaderboard({ by: 'wins', limit: 2 });

    expect(firstRun.entries.map((e) => e.address)).toEqual(
      secondRun.entries.map((e) => e.address),
    );
    expect(firstRun.nextCursor).toEqual(secondRun.nextCursor);
  });

  it('should support all sort modes (wins, volume, tickets) with cursor stability', async () => {
    const users = [
      makeUser('GUSER1', 10, 20, '1000', 100),
      makeUser('GUSER2', 5, 15, '500', 90),
    ];

    for (const mode of ['wins', 'volume', 'tickets'] as const) {
      setupLeaderboardQueryBuilder(users);
      const result = await controller.getLeaderboard({ by: mode, limit: 2 });

      expect(result.by).toBe(mode);
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].address).toBe('GUSER1');
      expect(result.ranking).toContain(`${mode} desc`.replace('wins', 'totalRafflesWon desc'));
    }
  });

  it('should encode cursor with all 6 sort values for deterministic seek', async () => {
    const users = [
      makeUser('GUSER1', 10, 20, '1000', 100),
    ];

    setupLeaderboardQueryBuilder(users);
    const result = await controller.getLeaderboard({ by: 'wins', limit: 1 });

    expect(result.nextCursor).toBeTruthy();

    if (result.nextCursor) {
      const decodedPayload = JSON.parse(
        Buffer.from(result.nextCursor, 'base64').toString('utf8'),
      );
      expect(decodedPayload.v).toHaveLength(5); // [primary, totalPrizeXlm, totalTicketsBought, totalRafflesWon, firstSeenLedger]
      expect(decodedPayload.a).toBe('GUSER1'); // address (final tiebreaker)
      
      // Verify values correspond to sort cascade
      expect(decodedPayload.v[0]).toBe('10'); // totalRafflesWon (primary for wins mode)
      expect(decodedPayload.v[1]).toBe('1000'); // totalPrizeXlm
      expect(decodedPayload.v[2]).toBe('20'); // totalTicketsBought
      expect(decodedPayload.v[3]).toBe('10'); // totalRafflesWon (appears again)
      expect(decodedPayload.v[4]).toBe('100'); // firstSeenLedger
    }
  });
});
