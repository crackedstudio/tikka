import { Logger } from '@nestjs/common';
import { UserProcessor } from './user.processor';
import { UserEntity } from '../database/entities/user.entity';
import { CacheService } from '../cache/cache.service';

/** A real, checksum-valid Stellar account address. */
const ADDRESS = 'GBZQEQYUHJSN5JCUOUS4MO2NY4HDNZAGDCOMF7Z2ZQZD3CSHJZAZ4WW3';

/** A second account, used wherever the test must not accidentally match. */
const OTHER_ADDRESS = 'GAON5T23YXAIIF54XGPZFORV7PVASERLXXFWG7JN745BZBLMIU3FICUJ';

interface RecordedStatement {
  kind: 'insert' | 'update' | 'unknown';
  values?: Record<string, unknown>;
  set?: Record<string, unknown>;
  where?: { sql: string; params?: Record<string, unknown> };
}

/**
 * Records the statements the processor issues rather than asserting on the
 * order mock methods happen to be called in, so the assertions stay meaningful
 * if the query builder chain is reordered.
 */
function createHarness(
  options: {
    existing?: unknown;
    priorTicket?: unknown[];
    failOn?: 'insert' | 'update';
  } = {},
) {
  const statements: RecordedStatement[] = [];
  const queries: Array<{ sql: string; params: unknown[] }> = [];

  function createQueryBuilder() {
    let current: RecordedStatement = { kind: 'unknown' };
    const chain = {
      insert: () => {
        current = { kind: 'insert' };
        return chain;
      },
      update: () => {
        current = { kind: 'update' };
        return chain;
      },
      into: () => chain,
      orIgnore: () => chain,
      values: (values: Record<string, unknown>) => {
        current.values = values;
        return chain;
      },
      set: (set: Record<string, unknown>) => {
        current.set = set;
        return chain;
      },
      where: (sql: string, params?: Record<string, unknown>) => {
        current.where = { sql, params };
        return chain;
      },
      execute: async () => {
        if (options.failOn === current.kind) {
          throw new Error('write failed');
        }
        statements.push(current);
        return { identifiers: [], affected: 1 };
      },
    };
    return chain;
  }

  const runner = {
    manager: {
      createQueryBuilder,
      findOne: jest.fn().mockResolvedValue(options.existing ?? null),
    },
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return options.priorTicket ?? [];
    }),
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  };

  const dataSource = {
    createQueryRunner: jest.fn(() => runner),
  };

  const cache = {
    invalidateUserProfile: jest.fn().mockResolvedValue(undefined),
    invalidateRaffleDetail: jest.fn().mockResolvedValue(undefined),
    invalidateLeaderboard: jest.fn().mockResolvedValue(undefined),
  };

  const processor = new UserProcessor(dataSource as never, cache as unknown as CacheService);

  return {
    processor,
    cache,
    statements,
    queries,
    runner,
    dataSource,
    insert: () => statements.find((s) => s.kind === 'insert'),
    update: () => statements.find((s) => s.kind === 'update'),
  };
}

describe('UserProcessor', () => {
  describe('address canonicalisation', () => {
    /**
     * `users.address` is the primary key, so a variant spelling does not merely
     * look up the wrong row — it creates a second row and splits the account's
     * history across both.
     */
    it.each([
      ['the canonical spelling', ADDRESS],
      ['surrounding whitespace', `  ${ADDRESS}  `],
      ['a leading tab', `\t${ADDRESS}`],
      ['lower case', ADDRESS.toLowerCase()],
      ['mixed case', ADDRESS.slice(0, 24).toLowerCase() + ADDRESS.slice(24)],
    ])('keys the buyer row by the canonical strkey given %s', async (_label, spelling) => {
      const h = createHarness();

      await h.processor.handleTicketPurchased(1, spelling, 2, 500, 'tx-1', h.runner as never);

      expect(h.insert()?.values?.address).toBe(ADDRESS);
      expect(h.update()?.where?.params).toEqual({ buyer: ADDRESS });
    });

    it('resolves two spellings of one account to the same primary key', async () => {
      const first = createHarness();
      const second = createHarness();

      await first.processor.handleTicketPurchased(
        1,
        ADDRESS,
        1,
        500,
        'tx-1',
        first.runner as never,
      );
      await second.processor.handleTicketPurchased(
        1,
        ADDRESS.toLowerCase(),
        1,
        500,
        'tx-2',
        second.runner as never,
      );

      expect(first.insert()?.values?.address).toBe(second.insert()?.values?.address);
    });

    it('does not conflate two different accounts', async () => {
      const h = createHarness();

      await h.processor.handleTicketPurchased(1, OTHER_ADDRESS, 1, 500, 'tx-1', h.runner as never);

      expect(h.insert()?.values?.address).toBe(OTHER_ADDRESS);
      expect(h.insert()?.values?.address).not.toBe(ADDRESS);
    });

    it('scopes the first-ticket-in-raffle probe to the canonical address', async () => {
      const h = createHarness();

      await h.processor.handleTicketPurchased(
        7,
        ` ${ADDRESS.toLowerCase()} `,
        3,
        900,
        'tx-9',
        h.runner as never,
      );

      expect(h.queries).toHaveLength(1);
      expect(h.queries[0].params).toEqual([ADDRESS, 7, 'tx-9']);
    });

    it('invalidates the profile cache under the canonical key', async () => {
      const h = createHarness();

      await h.processor.handleTicketPurchased(
        1,
        ADDRESS.toLowerCase(),
        1,
        500,
        'tx-1',
        h.runner as never,
      );

      expect(h.cache.invalidateUserProfile).toHaveBeenCalledWith(ADDRESS);
      expect(h.cache.invalidateUserProfile).not.toHaveBeenCalledWith(ADDRESS.toLowerCase());
    });

    it('canonicalises the winner before the upsert', async () => {
      const h = createHarness();

      await h.processor.handleRaffleFinalized(
        3,
        `  ${ADDRESS.toLowerCase()}  `,
        '100000000',
        h.runner as never,
      );

      expect(h.insert()?.values?.address).toBe(ADDRESS);
      expect(h.update()?.where?.params).toEqual({ winner: ADDRESS });
      expect(h.cache.invalidateUserProfile).toHaveBeenCalledWith(ADDRESS);
    });

    it('canonicalises the creator before the upsert', async () => {
      const h = createHarness();

      await h.processor.handleRaffleCreated(ADDRESS.toLowerCase(), 42, h.runner as never);

      expect(h.insert()?.values?.address).toBe(ADDRESS);
      expect(h.update()?.where?.params).toEqual({ creator: ADDRESS });
    });

    it('canonicalises the recipient before invalidating the cache', async () => {
      const h = createHarness();

      await h.processor.handleTicketRefunded(` ${ADDRESS.toLowerCase()} `, '11');

      expect(h.cache.invalidateUserProfile).toHaveBeenCalledWith(ADDRESS);
      expect(h.cache.invalidateRaffleDetail).toHaveBeenCalledWith('11');
    });

    /**
     * The contract emits canonical strkeys, so this branch is a data-integrity
     * signal. It must not drop the event: the tests in
     * `ingestor/handlers/duplicate-delivery.spec.ts` deliberately use non-address
     * fixtures, and a real malformed value still carries ledger state worth
     * keeping for reconciliation.
     */
    it.each([
      ['a truncated address', ADDRESS.slice(0, 20)],
      ['a non-address string', 'GBUYER'],
      ['an empty string', ''],
      ['a contract address', `C${ADDRESS.slice(1)}`],
    ])('stores %s verbatim and warns instead of dropping the event', async (_label, value) => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const h = createHarness();

      await h.processor.handleTicketPurchased(1, value, 1, 500, 'tx-1', h.runner as never);

      expect(h.insert()?.values?.address).toBe(value);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('not a canonical Stellar address'));
      warn.mockRestore();
    });
  });

  describe('handleTicketPurchased', () => {
    it('skips the write when the transaction was already applied', async () => {
      const h = createHarness({ existing: { lastTxHash: 'tx-1', firstSeenLedger: 500 } });

      await h.processor.handleTicketPurchased(1, ADDRESS, 1, 500, 'tx-1', h.runner as never);

      expect(h.update()).toBeUndefined();
      expect(h.cache.invalidateUserProfile).not.toHaveBeenCalled();
    });

    it('stamps the idempotency key and accumulates the ticket count', async () => {
      const h = createHarness();

      await h.processor.handleTicketPurchased(1, ADDRESS, 4, 500, 'tx-1', h.runner as never);

      const set = h.update()?.set as Record<string, unknown>;
      expect(typeof set.totalTicketsBought).toBe('function');
      expect(set.lastTxHash).toBe('tx-1');
      expect((set.totalTicketsBought as () => string)()).toBe('total_tickets_bought + 4');
    });
  });

  describe('handleRaffleFinalized', () => {
    /**
     * `prize_amount` is documented as stroops, so an integer string is the
     * contract. The `BigInt(...)` call is commented as a guard against
     * non-numeric input, but it throws rather than falling back — a decimal
     * amount would fail the whole RaffleFinalized event.
     */
    it('throws on a prize amount that is not an integer number of stroops', async () => {
      const h = createHarness();

      await expect(
        h.processor.handleRaffleFinalized(3, ADDRESS, '10.0000000', h.runner as never),
      ).rejects.toThrow();
      expect(h.update()).toBeUndefined();
    });

    it('does nothing when the raffle has no winner', async () => {
      const h = createHarness();

      await h.processor.handleRaffleFinalized(3, null, '100000000', h.runner as never);

      expect(h.statements).toHaveLength(0);
      expect(h.cache.invalidateUserProfile).not.toHaveBeenCalled();
    });
  });

  /**
   * `ticket.processor` and `raffle.processor` pass their own QueryRunner so the
   * user write joins their transaction. Called directly — the backfill and
   * replay paths — the processor has to own the transaction, and must not commit
   * or release a runner it did not create.
   */
  describe('transaction ownership', () => {
    it.each([
      [
        'handleTicketPurchased',
        (p: UserProcessor) => p.handleTicketPurchased(1, ADDRESS, 1, 500, 'tx-1'),
      ],
      [
        'handleRaffleFinalized',
        (p: UserProcessor) => p.handleRaffleFinalized(1, ADDRESS, '100000000'),
      ],
      ['handleRaffleCreated', (p: UserProcessor) => p.handleRaffleCreated(ADDRESS, 500)],
    ])('%s opens and commits its own transaction', async (_name, invoke) => {
      const h = createHarness();

      await invoke(h.processor);

      expect(h.dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
      expect(h.runner.connect).toHaveBeenCalledTimes(1);
      expect(h.runner.startTransaction).toHaveBeenCalledTimes(1);
      expect(h.runner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(h.runner.release).toHaveBeenCalledTimes(1);
      expect(h.runner.rollbackTransaction).not.toHaveBeenCalled();
    });

    it.each([
      [
        'handleTicketPurchased',
        (p: UserProcessor) => p.handleTicketPurchased(1, ADDRESS, 1, 500, 'tx-1'),
      ],
      [
        'handleRaffleFinalized',
        (p: UserProcessor) => p.handleRaffleFinalized(1, ADDRESS, '100000000'),
      ],
      ['handleRaffleCreated', (p: UserProcessor) => p.handleRaffleCreated(ADDRESS, 500)],
    ])('%s rolls back and releases when the write fails', async (_name, invoke) => {
      const h = createHarness({ failOn: 'update' });

      await expect(invoke(h.processor)).rejects.toThrow('write failed');

      expect(h.runner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(h.runner.release).toHaveBeenCalledTimes(1);
      expect(h.runner.commitTransaction).not.toHaveBeenCalled();
      expect(h.cache.invalidateUserProfile).not.toHaveBeenCalled();
    });

    it.each([
      [
        'handleTicketPurchased',
        (p: UserProcessor, r: unknown) =>
          p.handleTicketPurchased(1, ADDRESS, 1, 500, 'tx-1', r as never),
      ],
      [
        'handleRaffleFinalized',
        (p: UserProcessor, r: unknown) =>
          p.handleRaffleFinalized(1, ADDRESS, '100000000', r as never),
      ],
      [
        'handleRaffleCreated',
        (p: UserProcessor, r: unknown) => p.handleRaffleCreated(ADDRESS, 500, r as never),
      ],
    ])('%s leaves a caller-owned transaction alone', async (_name, invoke) => {
      const h = createHarness();

      await invoke(h.processor, h.runner);

      expect(h.dataSource.createQueryRunner).not.toHaveBeenCalled();
      expect(h.runner.connect).not.toHaveBeenCalled();
      expect(h.runner.commitTransaction).not.toHaveBeenCalled();
      expect(h.runner.rollbackTransaction).not.toHaveBeenCalled();
      expect(h.runner.release).not.toHaveBeenCalled();
    });

    it('propagates the failure without rolling back a caller-owned transaction', async () => {
      const h = createHarness({ failOn: 'update' });

      await expect(
        h.processor.handleTicketPurchased(1, ADDRESS, 1, 500, 'tx-1', h.runner as never),
      ).rejects.toThrow('write failed');

      expect(h.runner.rollbackTransaction).not.toHaveBeenCalled();
      expect(h.runner.release).not.toHaveBeenCalled();
    });
  });
});
