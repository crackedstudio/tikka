import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, QueryRunner } from 'typeorm';
import { UserProcessor } from './user.processor';
import { CacheService } from '../cache/cache.service';
import { UserEntity } from '../database/entities/user.entity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal fake QueryRunner whose manager.createQueryBuilder() is
 *  controlled by the caller via the returned jest mocks. */
function makeQueryRunner() {
  const insertBuilder = {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ identifiers: [], raw: { rowCount: 1 } }),
  };

  const updateBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const manager = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    query: jest.fn(),
  };

  const runner: Partial<QueryRunner> = {
    manager: manager as any,
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
  };

  return { runner: runner as QueryRunner, manager, insertBuilder, updateBuilder };
}

/** Shorthand for a partial UserEntity findOne result. */
function userRow(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    address: 'GABC',
    totalTicketsBought: 0,
    totalRafflesEntered: 0,
    totalRafflesWon: 0,
    totalPrizeXlm: '0',
    firstSeenLedger: 100,
    lastTxHash: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('UserProcessor', () => {
  let processor: UserProcessor;
  let cacheService: jest.Mocked<CacheService>;
  let dataSource: { createQueryRunner: jest.Mock };

  beforeEach(async () => {
    cacheService = {
      invalidateUserProfile: jest.fn().mockResolvedValue(undefined),
      invalidateRaffleDetail: jest.fn().mockResolvedValue(undefined),
      invalidateLeaderboard: jest.fn().mockResolvedValue(undefined),
    } as any;

    dataSource = { createQueryRunner: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserProcessor,
        { provide: DataSource, useValue: dataSource },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    processor = module.get<UserProcessor>(UserProcessor);
  });

  // =========================================================================
  // handleTicketPurchased
  // =========================================================================
  describe('handleTicketPurchased', () => {
    it('creates the user row and increments stats on first event for a new address', async () => {
      const { runner, manager, insertBuilder, updateBuilder } = makeQueryRunner();

      // new user — no existing row
      manager.findOne.mockResolvedValue(userRow({ lastTxHash: null }));
      // no prior ticket in this raffle → first entry
      (runner.query as jest.Mock).mockResolvedValue([]);

      manager.createQueryBuilder
        .mockReturnValueOnce(insertBuilder) // upsert user row
        .mockReturnValueOnce(updateBuilder); // increment counters

      await processor.handleTicketPurchased(1, 'GABC', 3, 500, 'tx-001', runner);

      // User row must be upserted
      expect(insertBuilder.into).toHaveBeenCalledWith(UserEntity);
      expect(insertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({ address: 'GABC', firstSeenLedger: 500 }),
      );
      expect(insertBuilder.orIgnore).toHaveBeenCalled();

      // Counter increment must reference correct fields
      const setArg = updateBuilder.set.mock.calls[0][0];
      expect(typeof setArg.totalTicketsBought).toBe('function');
      expect(typeof setArg.totalRafflesEntered).toBe('function');
      expect(typeof setArg.firstSeenLedger).toBe('function');
      expect(setArg.lastTxHash).toBe('tx-001');
    });

    it('increments totalRafflesEntered only on the first ticket in a raffle', async () => {
      const { runner, manager, insertBuilder, updateBuilder } = makeQueryRunner();

      manager.findOne.mockResolvedValue(userRow({ lastTxHash: null }));
      // prior ticket exists in this raffle → NOT the first entry
      (runner.query as jest.Mock).mockResolvedValue([{ 1: '1' }]);

      manager.createQueryBuilder
        .mockReturnValueOnce(insertBuilder)
        .mockReturnValueOnce(updateBuilder);

      await processor.handleTicketPurchased(1, 'GABC', 2, 501, 'tx-002', runner);

      const setArg = updateBuilder.set.mock.calls[0][0];
      // The SQL expression must NOT add 1 to total_raffles_entered
      const expr: string = setArg.totalRafflesEntered();
      expect(expr).toMatch(/total_raffles_entered\s*$/);
      expect(expr).not.toMatch(/\+\s*1/);
    });

    it('is idempotent — same txHash applied twice does not double-count', async () => {
      const { runner, manager, insertBuilder, updateBuilder } = makeQueryRunner();

      // Second delivery: lastTxHash already equals incoming txHash
      manager.findOne.mockResolvedValue(userRow({ lastTxHash: 'tx-dup' }));
      manager.createQueryBuilder.mockReturnValue(insertBuilder);

      await processor.handleTicketPurchased(1, 'GABC', 2, 502, 'tx-dup', runner);

      // update must never be called — processing was short-circuited
      expect(updateBuilder.execute).not.toHaveBeenCalled();
      expect(cacheService.invalidateUserProfile).not.toHaveBeenCalled();
    });

    it('does not double-count when the same event is delivered a second time in a new runner', async () => {
      // Simulate two separate handler invocations (e.g. two SSE re-deliveries)
      // Both share the same txHash; the second must be a no-op.

      const firstRun = makeQueryRunner();
      const secondRun = makeQueryRunner();

      // First invocation: user not yet seen (null lastTxHash)
      firstRun.manager.findOne.mockResolvedValue(userRow({ lastTxHash: null }));
      (firstRun.runner.query as jest.Mock).mockResolvedValue([]);
      firstRun.manager.createQueryBuilder
        .mockReturnValueOnce(firstRun.insertBuilder)
        .mockReturnValueOnce(firstRun.updateBuilder);

      // Second invocation: user row now has lastTxHash stamped from first run
      secondRun.manager.findOne.mockResolvedValue(userRow({ lastTxHash: 'tx-replay' }));
      secondRun.manager.createQueryBuilder.mockReturnValue(secondRun.insertBuilder);

      await processor.handleTicketPurchased(1, 'GABC', 2, 503, 'tx-replay', firstRun.runner);
      await processor.handleTicketPurchased(1, 'GABC', 2, 503, 'tx-replay', secondRun.runner);

      // Only the first run should have issued the update
      expect(firstRun.updateBuilder.execute).toHaveBeenCalledTimes(1);
      expect(secondRun.updateBuilder.execute).not.toHaveBeenCalled();
    });

    it('manages its own transaction when no external QueryRunner is supplied', async () => {
      const { runner, manager, insertBuilder, updateBuilder } = makeQueryRunner();
      dataSource.createQueryRunner.mockReturnValue(runner);

      manager.findOne.mockResolvedValue(userRow({ lastTxHash: null }));
      (runner.query as jest.Mock).mockResolvedValue([]);
      manager.createQueryBuilder
        .mockReturnValueOnce(insertBuilder)
        .mockReturnValueOnce(updateBuilder);

      await processor.handleTicketPurchased(1, 'GABC', 1, 504, 'tx-own');

      expect(runner.connect).toHaveBeenCalled();
      expect(runner.startTransaction).toHaveBeenCalled();
      expect(runner.commitTransaction).toHaveBeenCalled();
      expect(runner.release).toHaveBeenCalled();
      // rollback must NOT have been called on the happy path
      expect(runner.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('rolls back and rethrows when an error occurs in a self-owned transaction', async () => {
      const { runner, manager, insertBuilder } = makeQueryRunner();
      dataSource.createQueryRunner.mockReturnValue(runner);

      // Explode on the findOne idempotency check
      manager.createQueryBuilder.mockReturnValue(insertBuilder);
      manager.findOne.mockRejectedValue(new Error('db exploded'));

      await expect(processor.handleTicketPurchased(1, 'GABC', 1, 505, 'tx-err')).rejects.toThrow(
        'db exploded',
      );

      expect(runner.rollbackTransaction).toHaveBeenCalled();
      expect(runner.release).toHaveBeenCalled();
    });

    it('invalidates user profile and raffle detail caches on success', async () => {
      const { runner, manager, insertBuilder, updateBuilder } = makeQueryRunner();

      manager.findOne.mockResolvedValue(userRow({ lastTxHash: null }));
      (runner.query as jest.Mock).mockResolvedValue([]);
      manager.createQueryBuilder
        .mockReturnValueOnce(insertBuilder)
        .mockReturnValueOnce(updateBuilder);

      await processor.handleTicketPurchased(2, 'GABC', 1, 506, 'tx-cache', runner);

      expect(cacheService.invalidateUserProfile).toHaveBeenCalledWith('GABC');
      expect(cacheService.invalidateRaffleDetail).toHaveBeenCalledWith('2');
    });
  });

  // =========================================================================
  // handleTicketRefunded
  // =========================================================================
  describe('handleTicketRefunded', () => {
    it('invalidates user profile and raffle detail caches', async () => {
      await processor.handleTicketRefunded('GABC', '7');

      expect(cacheService.invalidateUserProfile).toHaveBeenCalledWith('GABC');
      expect(cacheService.invalidateRaffleDetail).toHaveBeenCalledWith('7');
    });

    it('does not mutate any user aggregate column (refund is cache-only)', async () => {
      // handleTicketRefunded has no DB writes — it relies on the ticket processor
      // to mark the ticket refunded; here we only check it never touches dataSource
      await processor.handleTicketRefunded('GABC', '7');

      expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // handleRaffleFinalized
  // =========================================================================
  describe('handleRaffleFinalized', () => {
    it('creates winner row and increments raffles-won + prize on first finalization', async () => {
      const { runner, manager, insertBuilder, updateBuilder } = makeQueryRunner();

      manager.findOne.mockResolvedValue(userRow({ lastTxHash: null }));
      manager.createQueryBuilder
        .mockReturnValueOnce(insertBuilder)
        .mockReturnValueOnce(updateBuilder);

      await processor.handleRaffleFinalized(5, 'GWINNER', '1000000000', runner);

      expect(insertBuilder.into).toHaveBeenCalledWith(UserEntity);
      expect(insertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({ address: 'GWINNER' }),
      );

      const setArg = updateBuilder.set.mock.calls[0][0];
      expect(typeof setArg.totalRafflesWon).toBe('function');
      expect(typeof setArg.totalPrizeXlm).toBe('function');
      // Prize SQL must incorporate the supplied amount
      const prizeExpr: string = setArg.totalPrizeXlm();
      expect(prizeExpr).toContain('1000000000');
    });

    it('is idempotent — replaying the same raffle finalization is a no-op', async () => {
      const { runner, manager, insertBuilder, updateBuilder } = makeQueryRunner();

      // Synthetic key already present
      manager.findOne.mockResolvedValue(userRow({ lastTxHash: 'finalized:5' }));
      manager.createQueryBuilder.mockReturnValue(insertBuilder);

      await processor.handleRaffleFinalized(5, 'GWINNER', '1000000000', runner);

      expect(updateBuilder.execute).not.toHaveBeenCalled();
      expect(cacheService.invalidateLeaderboard).not.toHaveBeenCalled();
    });

    it('returns early without error when winner is null', async () => {
      // Null winner means no winner was drawn (e.g. cancelled before draw)
      await expect(
        processor.handleRaffleFinalized(9, null, '0', undefined),
      ).resolves.toBeUndefined();

      expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    });

    it('manages its own transaction and releases on success', async () => {
      const { runner, manager, insertBuilder, updateBuilder } = makeQueryRunner();
      dataSource.createQueryRunner.mockReturnValue(runner);

      manager.findOne.mockResolvedValue(userRow({ lastTxHash: null }));
      manager.createQueryBuilder
        .mockReturnValueOnce(insertBuilder)
        .mockReturnValueOnce(updateBuilder);

      await processor.handleRaffleFinalized(6, 'GWINNER', '500', undefined);

      expect(runner.connect).toHaveBeenCalled();
      expect(runner.startTransaction).toHaveBeenCalled();
      expect(runner.commitTransaction).toHaveBeenCalled();
      expect(runner.release).toHaveBeenCalled();
    });

    it('rolls back and rethrows on error', async () => {
      const { runner, manager, insertBuilder } = makeQueryRunner();
      dataSource.createQueryRunner.mockReturnValue(runner);

      manager.createQueryBuilder.mockReturnValue(insertBuilder);
      manager.findOne.mockRejectedValue(new Error('prize calc error'));

      await expect(processor.handleRaffleFinalized(7, 'GWINNER', '100', undefined)).rejects.toThrow(
        'prize calc error',
      );

      expect(runner.rollbackTransaction).toHaveBeenCalled();
      expect(runner.release).toHaveBeenCalled();
    });

    it('invalidates user profile and leaderboard caches on success', async () => {
      const { runner, manager, insertBuilder, updateBuilder } = makeQueryRunner();

      manager.findOne.mockResolvedValue(userRow({ lastTxHash: null }));
      manager.createQueryBuilder
        .mockReturnValueOnce(insertBuilder)
        .mockReturnValueOnce(updateBuilder);

      await processor.handleRaffleFinalized(8, 'GWINNER', '250', runner);

      expect(cacheService.invalidateUserProfile).toHaveBeenCalledWith('GWINNER');
      expect(cacheService.invalidateLeaderboard).toHaveBeenCalled();
    });

    it('rejects a non-numeric prize amount without poisoning the database', async () => {
      const { runner, manager, insertBuilder, updateBuilder } = makeQueryRunner();
      manager.findOne.mockResolvedValue(userRow({ lastTxHash: null }));
      manager.createQueryBuilder
        .mockReturnValueOnce(insertBuilder)
        .mockReturnValueOnce(updateBuilder);

      // '' should be coerced to '0' — BigInt('') throws so the processor guards against it
      await expect(
        processor.handleRaffleFinalized(10, 'GWINNER', '', runner),
      ).resolves.toBeUndefined();

      const setArg = updateBuilder.set.mock.calls[0][0];
      const prizeExpr: string = setArg.totalPrizeXlm();
      expect(prizeExpr).toContain('0');
    });
  });

  // =========================================================================
  // handleRaffleCreated
  // =========================================================================
  describe('handleRaffleCreated', () => {
    it('upserts creator row with correct firstSeenLedger', async () => {
      const { runner, manager, insertBuilder, updateBuilder } = makeQueryRunner();

      manager.createQueryBuilder
        .mockReturnValueOnce(insertBuilder)
        .mockReturnValueOnce(updateBuilder);

      await processor.handleRaffleCreated('GCREATOR', 300, runner);

      expect(insertBuilder.into).toHaveBeenCalledWith(UserEntity);
      expect(insertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({ address: 'GCREATOR', firstSeenLedger: 300 }),
      );
      expect(insertBuilder.orIgnore).toHaveBeenCalled();
    });

    it('keeps the earlier firstSeenLedger when creator already exists', async () => {
      const { runner, manager, insertBuilder, updateBuilder } = makeQueryRunner();

      manager.createQueryBuilder
        .mockReturnValueOnce(insertBuilder)
        .mockReturnValueOnce(updateBuilder);

      await processor.handleRaffleCreated('GCREATOR', 999, runner);

      const setArg = updateBuilder.set.mock.calls[0][0];
      // The expression must use LEAST to preserve the smaller ledger
      const ledgerExpr: string = setArg.firstSeenLedger();
      expect(ledgerExpr).toMatch(/least/i);
      expect(ledgerExpr).toContain('999');
    });

    it('manages its own transaction when no runner is supplied', async () => {
      const { runner, manager, insertBuilder, updateBuilder } = makeQueryRunner();
      dataSource.createQueryRunner.mockReturnValue(runner);

      manager.createQueryBuilder
        .mockReturnValueOnce(insertBuilder)
        .mockReturnValueOnce(updateBuilder);

      await processor.handleRaffleCreated('GCREATOR', 400);

      expect(runner.connect).toHaveBeenCalled();
      expect(runner.startTransaction).toHaveBeenCalled();
      expect(runner.commitTransaction).toHaveBeenCalled();
      expect(runner.release).toHaveBeenCalled();
      expect(runner.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('rolls back and rethrows on insert error', async () => {
      const { runner, manager, insertBuilder } = makeQueryRunner();
      dataSource.createQueryRunner.mockReturnValue(runner);

      insertBuilder.execute.mockRejectedValue(new Error('insert failed'));
      manager.createQueryBuilder.mockReturnValue(insertBuilder);

      await expect(processor.handleRaffleCreated('GCREATOR', 401)).rejects.toThrow('insert failed');

      expect(runner.rollbackTransaction).toHaveBeenCalled();
      expect(runner.release).toHaveBeenCalled();
    });

    it('is idempotent — second call for same creator does not error', async () => {
      // orIgnore() on the insert means a second call is always a safe no-op.
      const { runner, manager, insertBuilder, updateBuilder } = makeQueryRunner();

      manager.createQueryBuilder
        .mockReturnValueOnce(insertBuilder)
        .mockReturnValueOnce(updateBuilder)
        .mockReturnValueOnce(insertBuilder) // second call
        .mockReturnValueOnce(updateBuilder);

      await processor.handleRaffleCreated('GCREATOR', 300, runner);
      await processor.handleRaffleCreated('GCREATOR', 300, runner);

      expect(insertBuilder.orIgnore).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Address normalisation
  // =========================================================================
  describe('address normalisation', () => {
    /**
     * The backend users.service.ts delegates to the indexer API which returns
     * addresses exactly as stored.  Both services must therefore store the
     * address with identical casing.  Stellar addresses are case-sensitive
     * uppercase strings (G…), so we verify the processor never silently
     * lowercases or transforms the supplied address.
     */
    it('stores the address exactly as supplied (case-sensitive)', async () => {
      const { runner, manager, insertBuilder, updateBuilder } = makeQueryRunner();

      manager.findOne.mockResolvedValue(userRow({ address: 'GABC123XYZ', lastTxHash: null }));
      (runner.query as jest.Mock).mockResolvedValue([]);
      manager.createQueryBuilder
        .mockReturnValueOnce(insertBuilder)
        .mockReturnValueOnce(updateBuilder);

      await processor.handleTicketPurchased(1, 'GABC123XYZ', 1, 600, 'tx-norm', runner);

      const insertedValues = insertBuilder.values.mock.calls[0][0];
      expect(insertedValues.address).toBe('GABC123XYZ');

      const [, whereParams] = updateBuilder.where.mock.calls[0];
      // The WHERE clause binds by parameter name; the param value must be the exact address
      expect(whereParams).toMatchObject({ buyer: 'GABC123XYZ' });
    });

    it('cache invalidation uses the exact address as stored', async () => {
      const { runner, manager, insertBuilder, updateBuilder } = makeQueryRunner();

      manager.findOne.mockResolvedValue(userRow({ lastTxHash: null }));
      (runner.query as jest.Mock).mockResolvedValue([]);
      manager.createQueryBuilder
        .mockReturnValueOnce(insertBuilder)
        .mockReturnValueOnce(updateBuilder);

      await processor.handleTicketPurchased(1, 'GABC123XYZ', 1, 601, 'tx-cache-norm', runner);

      expect(cacheService.invalidateUserProfile).toHaveBeenCalledWith('GABC123XYZ');
    });
  });

  // =========================================================================
  // Reorg / compensating rollback
  // =========================================================================
  describe('reorg / compensating rollback', () => {
    /**
     * When a reorg is detected, ReorgRollbackService nullifies user rows that
     * were written in the rolled-back ledger range.  After the reorg, the
     * same events are re-delivered.  The processor must apply them cleanly
     * (lastTxHash was cleared by the rollback, so the idempotency guard lets
     * the event through again).
     */
    it('re-applies an event whose lastTxHash was cleared by a rollback', async () => {
      const { runner, manager, insertBuilder, updateBuilder } = makeQueryRunner();

      // Simulate post-rollback state: lastTxHash was nulled by ReorgRollbackService
      manager.findOne.mockResolvedValue(userRow({ lastTxHash: null }));
      (runner.query as jest.Mock).mockResolvedValue([]);
      manager.createQueryBuilder
        .mockReturnValueOnce(insertBuilder)
        .mockReturnValueOnce(updateBuilder);

      // Re-delivery of the same event after a rollback must succeed
      await expect(
        processor.handleTicketPurchased(1, 'GABC', 2, 700, 'tx-reorged', runner),
      ).resolves.toBeUndefined();

      expect(updateBuilder.execute).toHaveBeenCalledTimes(1);
    });

    it('does not re-apply an event that survived the reorg (lastTxHash still set)', async () => {
      const { runner, manager, insertBuilder } = makeQueryRunner();

      // Simulate: this event was NOT in the rolled-back range, lastTxHash is intact
      manager.findOne.mockResolvedValue(userRow({ lastTxHash: 'tx-survived' }));
      manager.createQueryBuilder.mockReturnValue(insertBuilder);

      await processor.handleTicketPurchased(1, 'GABC', 2, 701, 'tx-survived', runner);

      // The update must be skipped — this event was already committed before the reorg
      expect(manager.createQueryBuilder).toHaveBeenCalledTimes(1); // only the INSERT (upsert)
    });
  });
});
