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

function makeUser(address: string, wins: number): UserEntity {
  return {
    address,
    totalTicketsBought: wins,
    totalRafflesEntered: wins,
    totalRafflesWon: wins,
    totalPrizeXlm: String(wins * 10),
    firstSeenLedger: 1,
    lastTxHash: null,
    updatedAt: new Date(),
  };
}

describe('LeaderboardController', () => {
  let controller: LeaderboardController;
  let cacheService: { wrap: jest.Mock };
  let createQueryBuilder: jest.Mock;

  beforeEach(() => {
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

    createQueryBuilder.mockReturnValueOnce(qb);
    return qb;
  }

  it('returns cursor pages without duplicate entries', async () => {
    const firstRows = [makeUser('A', 10), makeUser('B', 9), makeUser('C', 8)];
    setupQueryBuilder(firstRows);

    const page1 = await controller.getLeaderboard('wins', 2);
    expect(page1.entries.map((e) => e.address)).toEqual(['A', 'B']);
    expect(page1.nextCursor).toBeTruthy();

    const secondRows = [makeUser('C', 8)];
    const qb2 = setupQueryBuilder(secondRows);

    const page2 = await controller.getLeaderboard('wins', 2, page1.nextCursor ?? undefined);
    expect(page2.entries.map((e) => e.address)).toEqual(['C']);
    expect(new Set([...page1.entries, ...page2.entries].map((e) => e.address)).size).toBe(3);
    expect(qb2.andWhere).toHaveBeenCalled();
  });

  it('supports deprecated offset pagination', async () => {
    const qb = setupQueryBuilder([makeUser('B', 9), makeUser('C', 8)]);

    await controller.getLeaderboard('wins', 2, undefined, 1);

    expect(qb.skip).toHaveBeenCalledWith(1);
  });
});
