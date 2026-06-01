import { LeaderboardController } from './leaderboard.controller';
import { CacheService } from '../../cache/cache.service';
import { UserEntity } from '../../database/entities/user.entity';

type MockQb = {
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  andWhere: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getMany: jest.Mock;
};

function makeUser(
  address: string,
  wins: number,
  tickets = wins,
  prize = String(wins * 10),
  firstSeenLedger = 1,
): UserEntity {
  return {
    address,
    totalTicketsBought: tickets,
    totalRafflesEntered: tickets,
    totalRafflesWon: wins,
    totalPrizeXlm: prize,
    firstSeenLedger,
    lastTxHash: null,
    updatedAt: new Date(),
  };
}

describe('LeaderboardController', () => {
  let controller: LeaderboardController;
  let cacheService: { wrap: jest.Mock };
  let createQueryBuilder: jest.Mock;
  const builders: MockQb[] = [];

  beforeEach(() => {
    builders.length = 0;
    cacheService = {
      wrap: jest.fn(async (_key, _ttl, fetcher) => fetcher()),
    };
    createQueryBuilder = jest.fn();

    controller = new LeaderboardController(
      { createQueryBuilder } as any,
      cacheService as unknown as CacheService,
    );
  });

  function setupQueryBuilder(rows: UserEntity[]): MockQb {
    const qb: MockQb = {
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      andWhere: jest.fn(),
      skip: jest.fn(),
      take: jest.fn(),
      getMany: jest.fn().mockResolvedValue(rows),
    };

    qb.orderBy.mockReturnValue(qb);
    qb.addOrderBy.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    qb.skip.mockReturnValue(qb);
    qb.take.mockReturnValue(qb);

    builders.push(qb);
    createQueryBuilder.mockReturnValueOnce(qb);
    return qb;
  }

  it('applies deterministic tie-breakers and returns stable DTO ranks', async () => {
    const rows = [
      makeUser('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 2, 5, '100', 10),
      makeUser('GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 2, 5, '100', 10),
      makeUser('GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', 2, 5, '100', 30),
    ];
    const qb = setupQueryBuilder(rows);

    const page = await controller.getLeaderboard('wins', 3, undefined, 0);

    expect(qb.orderBy).toHaveBeenCalledWith('user.totalRafflesWon', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('CAST(user.totalPrizeXlm AS NUMERIC)', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('user.totalTicketsBought', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('user.totalRafflesWon', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('user.firstSeenLedger', 'ASC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('user.address', 'ASC');
    expect(page.entries.map((entry) => entry.address)).toEqual(rows.map((row) => row.address));
    expect(page.entries.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });

  it('returns cursor pages without duplicate entries', async () => {
    const firstRows = [makeUser('A', 10), makeUser('B', 9), makeUser('C', 8)];
    setupQueryBuilder(firstRows);

    const page1 = await controller.getLeaderboard('wins', 2);
    expect(page1.entries.map((e) => e.address)).toEqual(['A', 'B']);
    expect(page1.nextCursor).toBeTruthy();

    const secondRows = [makeUser('C', 8)];
    const qb2 = setupQueryBuilder(secondRows);

    const page2 = await controller.getLeaderboard(
      'wins',
      2,
      page1.nextCursor ?? undefined,
    );
    expect(page2.entries.map((e) => e.address)).toEqual(['C']);
    expect(new Set([...page1.entries, ...page2.entries].map((e) => e.address)).size).toBe(3);
    expect(qb2.andWhere).toHaveBeenCalled();
  });

  it('supports deprecated offset pagination with stable rank boundaries', async () => {
    const qb = setupQueryBuilder([makeUser('B', 9), makeUser('C', 8)]);

    const page = await controller.getLeaderboard('wins', 2, undefined, 1);

    expect(qb.skip).toHaveBeenCalledWith(1);
    expect(page.entries.map((entry) => entry.rank)).toEqual([2, 3]);
  });

  it('defines a primary ranking mode for each leaderboard type', async () => {
    for (const [mode, primaryOrder] of [
      ['wins', 'user.totalRafflesWon'],
      ['volume', 'CAST(user.totalPrizeXlm AS NUMERIC)'],
      ['tickets', 'user.totalTicketsBought'],
    ] as const) {
      const qb = setupQueryBuilder([makeUser('A', 1)]);

      await controller.getLeaderboard(mode, 10, undefined, 0);

      expect(qb.orderBy).toHaveBeenCalledWith(primaryOrder, 'DESC');
    }
  });

  it('hides internal fields like firstSeenLedger from DTO responses', async () => {
    const rows = [
      makeUser('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 2, 5, '100', 10),
    ];
    const qb = setupQueryBuilder(rows);

    const page = await controller.getLeaderboard('wins', 1, undefined, 0);

    expect(page.entries).toHaveLength(1);
    const entry = page.entries[0];

    // Verify exposed fields
    expect(entry).toHaveProperty('rank');
    expect(entry).toHaveProperty('address');
    expect(entry).toHaveProperty('totalTicketsBought');
    expect(entry).toHaveProperty('totalRafflesWon');
    expect(entry).toHaveProperty('totalPrizeXlm');

    // Verify internal fields are HIDDEN
    expect(entry).not.toHaveProperty('firstSeenLedger');
    expect((entry as any).firstSeenLedger).toBeUndefined();
    expect((entry as any).lastTxHash).toBeUndefined();
  });
});
