import { LeaderboardController } from './leaderboard.controller';

describe('LeaderboardController', () => {
  const users = [
    {
      address: 'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
      totalTicketsBought: 5,
      totalRafflesWon: 2,
      totalPrizeXlm: '100',
      firstSeenLedger: 30,
    },
    {
      address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      totalTicketsBought: 5,
      totalRafflesWon: 2,
      totalPrizeXlm: '100',
      firstSeenLedger: 10,
    },
    {
      address: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      totalTicketsBought: 5,
      totalRafflesWon: 2,
      totalPrizeXlm: '100',
      firstSeenLedger: 10,
    },
    {
      address: 'GDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
      totalTicketsBought: 9,
      totalRafflesWon: 1,
      totalPrizeXlm: '200',
      firstSeenLedger: 1,
    },
  ];

  function makeController() {
    const orderBys: Array<[string, 'ASC' | 'DESC']> = [];
    let take = 50;
    let skip = 0;

    const query: any = {};
    Object.assign(query, {
      orderBy: jest.fn((field: string, direction: 'ASC' | 'DESC'): any => {
        orderBys.push([field, direction]);
        return query;
      }),
      addOrderBy: jest.fn((field: string, direction: 'ASC' | 'DESC'): any => {
        orderBys.push([field, direction]);
        return query;
      }),
      skip: jest.fn((value: number): any => {
        skip = value;
        return query;
      }),
      take: jest.fn((value: number): any => {
        take = value;
        return query;
      }),
      getMany: jest.fn(async () => {
        const sorted = [...users].sort((left, right) => {
          for (const [field, direction] of orderBys) {
            const leftValue = valueFor(left, field);
            const rightValue = valueFor(right, field);
            const diff = compare(leftValue, rightValue);

            if (diff !== 0) {
              return direction === 'DESC' ? -diff : diff;
            }
          }

          return 0;
        });

        return sorted.slice(skip, skip + take);
      }),
    });

    const userRepo = {
      createQueryBuilder: jest.fn(() => query),
    };
    const cacheService = {
      wrap: jest.fn((_key: string, _ttl: number, fetcher: () => Promise<unknown>) =>
        fetcher(),
      ),
    };

    return {
      controller: new LeaderboardController(userRepo as any, cacheService as any),
      query,
      cacheService,
    };
  }

  it('applies deterministic tie-breakers and returns stable DTO ranks', async () => {
    const { controller } = makeController();

    const first = await controller.getLeaderboard('wins', 3, 0);
    const second = await controller.getLeaderboard('wins', 3, 0);

    expect(first).toEqual(second);
    expect(first.entries.map((entry) => entry.address)).toEqual([
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    ]);
    expect(first.entries.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });

  it('uses offset and limit for stable pagination boundaries', async () => {
    const { controller, cacheService } = makeController();

    const page = await controller.getLeaderboard('wins', 2, 1);

    expect(cacheService.wrap).toHaveBeenCalledWith(
      'leaderboard:wins:2:1',
      60,
      expect.any(Function),
    );
    expect(page.entries.map((entry) => entry.rank)).toEqual([2, 3]);
    expect(page.entries.map((entry) => entry.address)).toEqual([
      'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    ]);
  });

  it('defines a primary ranking mode for each leaderboard type', async () => {
    for (const [mode, primaryOrder] of [
      ['wins', 'user.totalRafflesWon'],
      ['volume', 'user.totalPrizeXlm::numeric'],
      ['tickets', 'user.totalTicketsBought'],
    ] as const) {
      const { controller, query } = makeController();

      await controller.getLeaderboard(mode, 10, 0);

      expect(query.orderBy).toHaveBeenCalledWith(primaryOrder, 'DESC');
    }
  });
});

function valueFor(user: any, field: string): string | number {
  if (field === 'user.totalRafflesWon') return user.totalRafflesWon;
  if (field === 'user.totalPrizeXlm::numeric') return Number(user.totalPrizeXlm);
  if (field === 'user.totalTicketsBought') return user.totalTicketsBought;
  if (field === 'user.firstSeenLedger') return user.firstSeenLedger;
  if (field === 'user.address') return user.address;
  throw new Error(`Unknown sort field ${field}`);
}

function compare(left: string | number, right: string | number): number {
  if (typeof left === 'string' && typeof right === 'string') {
    return left.localeCompare(right);
  }

  return Number(left) - Number(right);
}
