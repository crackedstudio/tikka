import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { UserProcessor } from './user.processor';
import { CacheService } from '../cache/cache.service';
import * as fc from 'fast-check';

const mockQueryBuilder = {
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  into: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  orIgnore: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue({}),
  getRawOne: jest.fn().mockResolvedValue({ total: '0', distinctRaffles: '0' }),
};

const mockQueryRunner = {
  connect: jest.fn().mockResolvedValue(undefined),
  startTransaction: jest.fn().mockResolvedValue(undefined),
  commitTransaction: jest.fn().mockResolvedValue(undefined),
  rollbackTransaction: jest.fn().mockResolvedValue(undefined),
  release: jest.fn().mockResolvedValue(undefined),
  query: jest.fn().mockResolvedValue([{ wins: 0, total_prize: '0' }]),
  manager: {
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  },
};

const mockDataSource = {
  createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};

const mockCacheService = {
  invalidateUserProfile: jest.fn().mockResolvedValue(undefined),
  invalidateRaffleDetail: jest.fn().mockResolvedValue(undefined),
  invalidateLeaderboard: jest.fn().mockResolvedValue(undefined),
};

describe('UserProcessor', () => {
  let processor: UserProcessor;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserProcessor,
        { provide: DataSource, useValue: mockDataSource },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    processor = module.get<UserProcessor>(UserProcessor);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Re-set default return values after clearAllMocks resets them
    mockQueryBuilder.insert.mockReturnThis();
    mockQueryBuilder.update.mockReturnThis();
    mockQueryBuilder.into.mockReturnThis();
    mockQueryBuilder.set.mockReturnThis();
    mockQueryBuilder.where.mockReturnThis();
    mockQueryBuilder.values.mockReturnThis();
    mockQueryBuilder.orIgnore.mockReturnThis();
    mockQueryBuilder.select.mockReturnThis();
    mockQueryBuilder.addSelect.mockReturnThis();
    mockQueryBuilder.execute.mockResolvedValue({});
    mockQueryBuilder.getRawOne.mockResolvedValue({ total: '0', distinctRaffles: '0' });

    mockQueryRunner.connect.mockResolvedValue(undefined);
    mockQueryRunner.startTransaction.mockResolvedValue(undefined);
    mockQueryRunner.commitTransaction.mockResolvedValue(undefined);
    mockQueryRunner.rollbackTransaction.mockResolvedValue(undefined);
    mockQueryRunner.release.mockResolvedValue(undefined);
    mockQueryRunner.query.mockResolvedValue([{ wins: 0, total_prize: '0' }]);
    mockQueryRunner.manager.createQueryBuilder.mockReturnValue(mockQueryBuilder);

    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);

    mockCacheService.invalidateUserProfile.mockResolvedValue(undefined);
    mockCacheService.invalidateRaffleDetail.mockResolvedValue(undefined);
    mockCacheService.invalidateLeaderboard.mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('Initial user creation', () => {
    it('handleTicketPurchased inserts new user row and updates firstSeenLedger with LEAST()', async () => {
      const buyer = 'GBUYER123456789012345678901234567890123456789012345678';
      const ledger = 42;

      await processor.handleTicketPurchased(1, buyer, ledger, 'txhash1');

      expect(mockQueryBuilder.insert).toHaveBeenCalled();
      expect(mockQueryBuilder.orIgnore).toHaveBeenCalled();

      // The second createQueryBuilder call is for the LEAST() update
      expect(mockQueryBuilder.update).toHaveBeenCalled();

      // Verify the set call contains a firstSeenLedger expression using LEAST
      const setCallWithLeast = mockQueryBuilder.set.mock.calls.find(([obj]) =>
        'firstSeenLedger' in obj,
      );
      expect(setCallWithLeast).toBeDefined();
      const firstSeenLedgerValue = setCallWithLeast[0].firstSeenLedger;
      // It's a function that returns a LEAST(...) expression
      const exprResult =
        typeof firstSeenLedgerValue === 'function'
          ? firstSeenLedgerValue()
          : firstSeenLedgerValue;
      expect(String(exprResult).toUpperCase()).toContain('LEAST');
    });

    it('handleRaffleCreated inserts new user row with creator address and ledger', async () => {
      const creator = 'GCREATOR12345678901234567890123456789012345678901234';
      const ledger = 100;

      await processor.handleRaffleCreated(creator, ledger);

      expect(mockQueryBuilder.insert).toHaveBeenCalled();
      expect(mockQueryBuilder.orIgnore).toHaveBeenCalled();
      expect(mockQueryBuilder.update).toHaveBeenCalled();
    });

    it('handleRaffleFinalized with non-null winner inserts user row with firstSeenLedger 0', async () => {
      const winner = 'GWINNER12345678901234567890123456789012345678901234';

      await processor.handleRaffleFinalized(1, winner, '5000');

      expect(mockQueryBuilder.insert).toHaveBeenCalled();

      const valuesCall = mockQueryBuilder.values.mock.calls.find(
        ([obj]) => 'firstSeenLedger' in obj,
      );
      expect(valuesCall).toBeDefined();
      expect(valuesCall[0].firstSeenLedger).toBe(0);
    });

    it('handleRaffleFinalized with null winner returns without any DB calls', async () => {
      await processor.handleRaffleFinalized(1, null, '0');

      expect(mockDataSource.createQueryRunner).not.toHaveBeenCalled();
    });
  });

  describe('Stat incrementing on ticket purchase', () => {
    it('issues COUNT(*) and COUNT(DISTINCT raffle_id) query via getRawOne', async () => {
      await processor.handleTicketPurchased(1, 'GBUYER...', 42, 'txhash');

      expect(mockQueryBuilder.select).toHaveBeenCalled();
      expect(mockQueryBuilder.getRawOne).toHaveBeenCalled();
    });

    it('maps { total: "3", distinctRaffles: "2" } to totalTicketsBought: 3, totalRafflesEntered: 2', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({ total: '3', distinctRaffles: '2' });

      await processor.handleTicketPurchased(1, 'GBUYER...', 42, 'txhash');

      const setCall = mockQueryBuilder.set.mock.calls.find(
        ([obj]) => 'totalTicketsBought' in obj,
      );
      expect(setCall).toBeDefined();
      expect(setCall[0].totalTicketsBought).toBe(3);
      expect(setCall[0].totalRafflesEntered).toBe(2);
    });

    it('maps null getRawOne result to totalTicketsBought: 0, totalRafflesEntered: 0', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue(null);

      await processor.handleTicketPurchased(1, 'GBUYER...', 42, 'txhash');

      const setCall = mockQueryBuilder.set.mock.calls.find(
        ([obj]) => 'totalTicketsBought' in obj,
      );
      expect(setCall).toBeDefined();
      expect(setCall[0].totalTicketsBought).toBe(0);
      expect(setCall[0].totalRafflesEntered).toBe(0);
    });

    it('calls invalidateUserProfile and invalidateRaffleDetail after success', async () => {
      await processor.handleTicketPurchased(1, 'GBUYER...', 42, 'txhash');

      expect(mockCacheService.invalidateUserProfile).toHaveBeenCalledWith('GBUYER...');
      expect(mockCacheService.invalidateRaffleDetail).toHaveBeenCalledWith('1');
    });
  });

  describe('Winner stat update on raffle finalization', () => {
    it('executes raw SQL query with winner address as $1', async () => {
      const winner = 'GWINNER12345678901234567890123456789012345678901234';

      await processor.handleRaffleFinalized(1, winner, '5000');

      expect(mockQueryRunner.query).toHaveBeenCalled();
      expect(mockQueryRunner.query.mock.calls[0][1]).toContain(winner);
    });

    it('maps { wins: 3, total_prize: "15000" } to totalRafflesWon: 3, totalPrizeXlm: "15000"', async () => {
      mockQueryRunner.query.mockResolvedValue([{ wins: 3, total_prize: '15000' }]);

      await processor.handleRaffleFinalized(1, 'GWINNER...', '5000');

      const setCall = mockQueryBuilder.set.mock.calls.find(
        ([obj]) => 'totalRafflesWon' in obj,
      );
      expect(setCall).toBeDefined();
      expect(setCall[0].totalRafflesWon).toBe(3);
      expect(setCall[0].totalPrizeXlm).toBe('15000');
    });

    it('maps null query result to totalRafflesWon: 0, totalPrizeXlm: "0"', async () => {
      mockQueryRunner.query.mockResolvedValue(null);

      await processor.handleRaffleFinalized(1, 'GWINNER...', '5000');

      const setCall = mockQueryBuilder.set.mock.calls.find(
        ([obj]) => 'totalRafflesWon' in obj,
      );
      expect(setCall).toBeDefined();
      expect(setCall[0].totalRafflesWon).toBe(0);
      expect(setCall[0].totalPrizeXlm).toBe('0');
    });

    it('calls invalidateUserProfile and invalidateLeaderboard after success', async () => {
      const winner = 'GWINNER12345678901234567890123456789012345678901234';

      await processor.handleRaffleFinalized(1, winner, '5000');

      expect(mockCacheService.invalidateUserProfile).toHaveBeenCalledWith(winner);
      expect(mockCacheService.invalidateLeaderboard).toHaveBeenCalled();
    });
  });

  describe('Transaction lifecycle', () => {
    it('handleTicketPurchased calls connect, startTransaction, commitTransaction, release in order', async () => {
      await processor.handleTicketPurchased(1, 'GBUYER...', 42, 'txhash');

      expect(mockQueryRunner.connect).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.startTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);

      // Verify call order using invocationCallOrder
      const connectOrder = mockQueryRunner.connect.mock.invocationCallOrder[0];
      const startOrder = mockQueryRunner.startTransaction.mock.invocationCallOrder[0];
      const commitOrder = mockQueryRunner.commitTransaction.mock.invocationCallOrder[0];
      const releaseOrder = mockQueryRunner.release.mock.invocationCallOrder[0];

      expect(connectOrder).toBeLessThan(startOrder);
      expect(startOrder).toBeLessThan(commitOrder);
      expect(commitOrder).toBeLessThan(releaseOrder);
    });

    it('handleRaffleFinalized calls connect, startTransaction, commitTransaction, release in order', async () => {
      await processor.handleRaffleFinalized(1, 'GWINNER...', '5000');

      expect(mockQueryRunner.connect).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.startTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);

      const connectOrder = mockQueryRunner.connect.mock.invocationCallOrder[0];
      const startOrder = mockQueryRunner.startTransaction.mock.invocationCallOrder[0];
      const commitOrder = mockQueryRunner.commitTransaction.mock.invocationCallOrder[0];
      const releaseOrder = mockQueryRunner.release.mock.invocationCallOrder[0];

      expect(connectOrder).toBeLessThan(startOrder);
      expect(startOrder).toBeLessThan(commitOrder);
      expect(commitOrder).toBeLessThan(releaseOrder);
    });

    it('handleRaffleCreated calls connect, startTransaction, commitTransaction, release in order', async () => {
      await processor.handleRaffleCreated('GCREATOR...', 100);

      expect(mockQueryRunner.connect).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.startTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);

      const connectOrder = mockQueryRunner.connect.mock.invocationCallOrder[0];
      const startOrder = mockQueryRunner.startTransaction.mock.invocationCallOrder[0];
      const commitOrder = mockQueryRunner.commitTransaction.mock.invocationCallOrder[0];
      const releaseOrder = mockQueryRunner.release.mock.invocationCallOrder[0];

      expect(connectOrder).toBeLessThan(startOrder);
      expect(startOrder).toBeLessThan(commitOrder);
      expect(commitOrder).toBeLessThan(releaseOrder);
    });

    it('handleTicketPurchased calls rollbackTransaction and NOT commitTransaction on error', async () => {
      mockQueryBuilder.execute.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        processor.handleTicketPurchased(1, 'GBUYER...', 42, 'txhash'),
      ).rejects.toThrow('DB error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });

    it('handleRaffleFinalized calls rollbackTransaction and NOT commitTransaction on error', async () => {
      mockQueryRunner.query.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        processor.handleRaffleFinalized(1, 'GWINNER...', '5000'),
      ).rejects.toThrow('DB error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });

    it('handleTicketPurchased with external QueryRunner does not call connect/startTransaction/commitTransaction/release', async () => {
      await processor.handleTicketPurchased(1, 'GBUYER...', 42, 'txhash', mockQueryRunner as any);

      expect(mockQueryRunner.connect).not.toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).not.toHaveBeenCalled();
    });
  });

  describe('Property-based tests', () => {
    // Feature: user-processor-tests, Property 1: ticket count numeric conversion preserves value
    it('stores totalTicketsBought as Number(total) for any non-negative integer', async () => {
      await fc.assert(
        fc.asyncProperty(fc.nat(), async (n) => {
          jest.clearAllMocks();
          // re-set all mock defaults here (same as beforeEach)
          mockQueryBuilder.insert.mockReturnThis();
          mockQueryBuilder.update.mockReturnThis();
          mockQueryBuilder.into.mockReturnThis();
          mockQueryBuilder.set.mockReturnThis();
          mockQueryBuilder.where.mockReturnThis();
          mockQueryBuilder.values.mockReturnThis();
          mockQueryBuilder.orIgnore.mockReturnThis();
          mockQueryBuilder.select.mockReturnThis();
          mockQueryBuilder.addSelect.mockReturnThis();
          mockQueryBuilder.execute.mockResolvedValue({});
          mockQueryBuilder.getRawOne.mockResolvedValue({
            total: String(n),
            distinctRaffles: String(n),
          });
          mockQueryRunner.connect.mockResolvedValue(undefined);
          mockQueryRunner.startTransaction.mockResolvedValue(undefined);
          mockQueryRunner.commitTransaction.mockResolvedValue(undefined);
          mockQueryRunner.rollbackTransaction.mockResolvedValue(undefined);
          mockQueryRunner.release.mockResolvedValue(undefined);
          mockQueryRunner.query.mockResolvedValue([{ wins: 0, total_prize: '0' }]);
          mockQueryRunner.manager.createQueryBuilder.mockReturnValue(mockQueryBuilder);
          mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
          mockCacheService.invalidateUserProfile.mockResolvedValue(undefined);
          mockCacheService.invalidateRaffleDetail.mockResolvedValue(undefined);
          mockCacheService.invalidateLeaderboard.mockResolvedValue(undefined);

          await processor.handleTicketPurchased(1, 'GADDR', 100, 'txhash');
          const setCall = mockQueryBuilder.set.mock.calls.find(
            ([obj]) => 'totalTicketsBought' in obj,
          );
          expect(setCall[0].totalTicketsBought).toBe(n);
        }),
        { numRuns: 100 },
      );
    });

    // Feature: user-processor-tests, Property 2: handleTicketPurchased is idempotent with respect to stat values
    it('produces the same set() args when called twice with the same ticket counts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.nat(), fc.nat(), fc.string(), fc.integer({ min: 1 }),
          async (total, distinct, buyer, raffleId) => {
            jest.clearAllMocks();
            // re-set all mock defaults
            mockQueryBuilder.insert.mockReturnThis();
            mockQueryBuilder.update.mockReturnThis();
            mockQueryBuilder.into.mockReturnThis();
            mockQueryBuilder.set.mockReturnThis();
            mockQueryBuilder.where.mockReturnThis();
            mockQueryBuilder.values.mockReturnThis();
            mockQueryBuilder.orIgnore.mockReturnThis();
            mockQueryBuilder.select.mockReturnThis();
            mockQueryBuilder.addSelect.mockReturnThis();
            mockQueryBuilder.execute.mockResolvedValue({});
            mockQueryBuilder.getRawOne.mockResolvedValue({
              total: String(total),
              distinctRaffles: String(distinct),
            });
            mockQueryRunner.connect.mockResolvedValue(undefined);
            mockQueryRunner.startTransaction.mockResolvedValue(undefined);
            mockQueryRunner.commitTransaction.mockResolvedValue(undefined);
            mockQueryRunner.rollbackTransaction.mockResolvedValue(undefined);
            mockQueryRunner.release.mockResolvedValue(undefined);
            mockQueryRunner.query.mockResolvedValue([{ wins: 0, total_prize: '0' }]);
            mockQueryRunner.manager.createQueryBuilder.mockReturnValue(mockQueryBuilder);
            mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
            mockCacheService.invalidateUserProfile.mockResolvedValue(undefined);
            mockCacheService.invalidateRaffleDetail.mockResolvedValue(undefined);
            mockCacheService.invalidateLeaderboard.mockResolvedValue(undefined);

            await processor.handleTicketPurchased(raffleId, buyer, 100, 'tx1');
            const firstSetArgs = mockQueryBuilder.set.mock.calls
              .find(([obj]) => 'totalTicketsBought' in obj)?.[0];

            jest.clearAllMocks();
            // re-set all mock defaults again
            mockQueryBuilder.insert.mockReturnThis();
            mockQueryBuilder.update.mockReturnThis();
            mockQueryBuilder.into.mockReturnThis();
            mockQueryBuilder.set.mockReturnThis();
            mockQueryBuilder.where.mockReturnThis();
            mockQueryBuilder.values.mockReturnThis();
            mockQueryBuilder.orIgnore.mockReturnThis();
            mockQueryBuilder.select.mockReturnThis();
            mockQueryBuilder.addSelect.mockReturnThis();
            mockQueryBuilder.execute.mockResolvedValue({});
            mockQueryBuilder.getRawOne.mockResolvedValue({
              total: String(total),
              distinctRaffles: String(distinct),
            });
            mockQueryRunner.connect.mockResolvedValue(undefined);
            mockQueryRunner.startTransaction.mockResolvedValue(undefined);
            mockQueryRunner.commitTransaction.mockResolvedValue(undefined);
            mockQueryRunner.rollbackTransaction.mockResolvedValue(undefined);
            mockQueryRunner.release.mockResolvedValue(undefined);
            mockQueryRunner.query.mockResolvedValue([{ wins: 0, total_prize: '0' }]);
            mockQueryRunner.manager.createQueryBuilder.mockReturnValue(mockQueryBuilder);
            mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
            mockCacheService.invalidateUserProfile.mockResolvedValue(undefined);
            mockCacheService.invalidateRaffleDetail.mockResolvedValue(undefined);
            mockCacheService.invalidateLeaderboard.mockResolvedValue(undefined);

            await processor.handleTicketPurchased(raffleId, buyer, 100, 'tx1');
            const secondSetArgs = mockQueryBuilder.set.mock.calls
              .find(([obj]) => 'totalTicketsBought' in obj)?.[0];

            expect(secondSetArgs).toEqual(firstSetArgs);
          },
        ),
        { numRuns: 100 },
      );
    });

    // Feature: user-processor-tests, Property 3: prize string representation is preserved without numeric coercion
    it('stores totalPrizeXlm as String(total_prize) for any numeric string', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.bigInt({ min: 0n }),
          async (prize) => {
            jest.clearAllMocks();
            // re-set all mock defaults
            mockQueryBuilder.insert.mockReturnThis();
            mockQueryBuilder.update.mockReturnThis();
            mockQueryBuilder.into.mockReturnThis();
            mockQueryBuilder.set.mockReturnThis();
            mockQueryBuilder.where.mockReturnThis();
            mockQueryBuilder.values.mockReturnThis();
            mockQueryBuilder.orIgnore.mockReturnThis();
            mockQueryBuilder.select.mockReturnThis();
            mockQueryBuilder.addSelect.mockReturnThis();
            mockQueryBuilder.execute.mockResolvedValue({});
            mockQueryBuilder.getRawOne.mockResolvedValue({ total: '0', distinctRaffles: '0' });
            mockQueryRunner.connect.mockResolvedValue(undefined);
            mockQueryRunner.startTransaction.mockResolvedValue(undefined);
            mockQueryRunner.commitTransaction.mockResolvedValue(undefined);
            mockQueryRunner.rollbackTransaction.mockResolvedValue(undefined);
            mockQueryRunner.release.mockResolvedValue(undefined);
            const prizeStr = String(prize);
            mockQueryRunner.query.mockResolvedValue([{ wins: 1, total_prize: prizeStr }]);
            mockQueryRunner.manager.createQueryBuilder.mockReturnValue(mockQueryBuilder);
            mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
            mockCacheService.invalidateUserProfile.mockResolvedValue(undefined);
            mockCacheService.invalidateRaffleDetail.mockResolvedValue(undefined);
            mockCacheService.invalidateLeaderboard.mockResolvedValue(undefined);

            await processor.handleRaffleFinalized(1, 'GWINNER', '0');
            const setCall = mockQueryBuilder.set.mock.calls.find(
              ([obj]) => 'totalPrizeXlm' in obj,
            );
            expect(setCall[0].totalPrizeXlm).toBe(prizeStr);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
