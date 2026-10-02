import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReorgRollbackService, RollbackAuditEntry } from './reorg-rollback.service';

/**
 * Fast unit coverage for `ReorgRollbackService`.
 *
 * `reorg.spec.ts` already asserts that each statement is *issued*. This spec
 * goes after what that block cannot express:
 *
 * - the range each statement is scoped to, and which of them are deliberately
 *   not scoped to the reorg range at all;
 * - the order of the statements, because the aggregate recompute is only
 *   correct when it runs after the deletes it derives from;
 * - the archive boundary, which `docs/database/raffle-events-retention.md`
 *   makes reachable: the archiver deletes `raffle_events` rows older than the
 *   retention window from Postgres after writing CSV, and leaves derived state
 *   alone, so a rollback reaching past the cutoff cannot see the archived raw
 *   events;
 * - idempotency and the failure audit, which today only the
 *   `integration`-named spec covers — and `pnpm test` skips that file via
 *   `--testPathIgnorePatterns=integration`.
 *
 * The manager records `(sql, params)` in order and answers by SQL content, so
 * inserting a statement between two `COUNT`s does not renumber every
 * assertion the way call-order mocking does.
 */

type StatementKind =
  | 'count.raffle_events'
  | 'count.tickets'
  | 'count.raffles'
  | 'count.dead_letter_events'
  | 'select.affectedUsers'
  | 'select.affectedDates'
  | 'delete.raffle_events'
  | 'delete.dead_letter_events'
  | 'delete.tickets'
  | 'delete.raffles'
  | 'delete.platform_stats'
  | 'delete.users'
  | 'update.users'
  | 'update.platform_state'
  | 'update.indexer_cursor'
  | 'other';

interface Statement {
  sql: string;
  params: unknown[];
  kind: StatementKind;
}

type CountedEntity = 'raffleEvents' | 'tickets' | 'raffles' | 'deadLetterEvents';

interface RollbackScenario {
  fromLedger: number;
  /** Rows the hot tables report for `ledger >= fromLedger`. */
  counts?: Partial<Record<CountedEntity, number>>;
  affectedUsers?: Array<{ address: string }>;
  affectedDates?: Array<{ date: string }>;
  /** Reject the first statement whose normalised SQL matches. */
  failWhen?: (sql: string) => boolean;
  failure?: unknown;
}

const COUNT_QUERIES: Array<[string, StatementKind]> = [
  ['raffle_events', 'count.raffle_events'],
  ['tickets', 'count.tickets'],
  ['raffles', 'count.raffles'],
  ['dead_letter_events', 'count.dead_letter_events'],
];

/** Collapse the service's multi-line template literals into a single line. */
function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/**
 * Classify by SQL content rather than by position. Order matters here: the
 * `UPDATE users` statement embeds `SELECT COALESCE(COUNT(*), 0) FROM tickets`,
 * so the bare `COUNT` checks have to be anchored to the statement head.
 */
function classify(raw: string): StatementKind {
  const sql = normalize(raw);

  if (sql.startsWith('SELECT COUNT(*) as count FROM ')) {
    const hit = COUNT_QUERIES.find(([table]) => sql.includes(`FROM ${table} `));
    if (hit) return hit[1];
  }
  if (sql.startsWith('SELECT DISTINCT u.address')) return 'select.affectedUsers';
  if (sql.startsWith('SELECT DISTINCT DATE(')) return 'select.affectedDates';
  if (sql.startsWith('DELETE FROM platform_stats')) return 'delete.platform_stats';
  if (sql.startsWith('DELETE FROM ')) {
    return `delete.${/^DELETE FROM (\w+)/.exec(sql)?.[1]}` as StatementKind;
  }
  if (sql.startsWith('UPDATE users')) return 'update.users';
  if (sql.startsWith('UPDATE platform_state')) return 'update.platform_state';
  if (sql.startsWith('UPDATE indexer_cursor')) return 'update.indexer_cursor';

  return 'other';
}

function buildHarness(scenario: RollbackScenario) {
  let counts: Record<CountedEntity, number> = {
    raffleEvents: 0,
    tickets: 0,
    raffles: 0,
    deadLetterEvents: 0,
    ...scenario.counts,
  };

  const statements: Statement[] = [];

  const manager = {
    query: jest.fn(async (raw: string, params?: unknown[]) => {
      const sql = normalize(raw);
      const kind = classify(raw);
      statements.push({ sql, params: params ?? [], kind });

      if (scenario.failWhen?.(sql)) {
        throw scenario.failure ?? new Error('statement failed');
      }

      switch (kind) {
        case 'count.raffle_events':
          return [{ count: String(counts.raffleEvents) }];
        case 'count.tickets':
          return [{ count: String(counts.tickets) }];
        case 'count.raffles':
          return [{ count: String(counts.raffles) }];
        case 'count.dead_letter_events':
          return [{ count: String(counts.deadLetterEvents) }];
        case 'select.affectedUsers':
          return scenario.affectedUsers ?? [];
        case 'select.affectedDates':
          return scenario.affectedDates ?? [];
        default:
          // Mutations are no-ops: the assertions are about the SQL issued.
          return undefined;
      }
    }),
  };

  const dataSource = {
    transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
    query: jest.fn(() => {
      throw new Error('rollback must not run statements outside its transaction');
    }),
  };

  const service = new ReorgRollbackService(dataSource as unknown as DataSource);

  const of = (kind: StatementKind) => statements.filter((s) => s.kind === kind);
  const one = (kind: StatementKind) => {
    const hits = of(kind);
    expect(hits).toHaveLength(1);
    return hits[0];
  };
  const at = (kind: StatementKind) => statements.findIndex((s) => s.kind === kind);

  return {
    service,
    statements,
    dataSource,
    manager,
    of,
    one,
    at,
    /** Swap the hot-row counts between two rollbacks of the same range. */
    setCounts: (next: Partial<Record<CountedEntity, number>>) => {
      counts = { ...counts, ...next };
    },
  };
}

/** Statement kinds in the order the service must emit them. */
const CANONICAL_ORDER: StatementKind[] = [
  'count.raffle_events',
  'count.tickets',
  'count.raffles',
  'count.dead_letter_events',
  'delete.raffle_events',
  'delete.dead_letter_events',
  'delete.tickets',
  'delete.raffles',
  'update.users',
  'delete.users',
  'delete.platform_stats',
  'update.platform_state',
  'update.indexer_cursor',
];

describe('ReorgRollbackService (unit)', () => {
  let errorSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    // The service logs the start and the failure of every rollback; keep the
    // jest output readable and assert on the calls where they matter.
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  describe('range scoping', () => {
    it('scopes every delete to the rollback ledger and above', async () => {
      const h = buildHarness({ fromLedger: 4200 });

      await h.service.rollback(4200);

      for (const kind of [
        'delete.raffle_events',
        'delete.dead_letter_events',
        'delete.tickets',
        'delete.raffles',
      ] as StatementKind[]) {
        expect(h.one(kind).sql).toContain('>= $1');
        expect(h.one(kind).params).toEqual([4200]);
      }
    });

    it('counts the affected rows before deleting them, with the same boundary', async () => {
      const h = buildHarness({ fromLedger: 4200 });

      await h.service.rollback(4200);

      for (const [kind, column] of [
        ['count.raffle_events', 'ledger'],
        ['count.tickets', 'purchased_at_ledger'],
        ['count.raffles', 'created_ledger'],
        ['count.dead_letter_events', 'ledger'],
      ] as Array<[StatementKind, string]>) {
        expect(h.one(kind).sql).toContain(`${column} >= $1`);
        expect(h.one(kind).params).toEqual([4200]);
        expect(h.at(kind)).toBeLessThan(h.at(kind.replace('count.', 'delete.') as StatementKind));
      }
    });

    it('covers a span of any width with the same number of statements', async () => {
      const narrow = buildHarness({
        fromLedger: 9100,
        counts: { raffleEvents: 12, tickets: 40, raffles: 6, deadLetterEvents: 3 },
      });
      const wide = buildHarness({
        fromLedger: 8000,
        counts: { raffleEvents: 1200, tickets: 4000, raffles: 600, deadLetterEvents: 300 },
      });

      const narrowAudit = await narrow.service.rollback(9100);
      const wideAudit = await wide.service.rollback(8000);

      // The range lives in the WHERE clause, so a 1000-ledger span costs no
      // more statements than a single-ledger one.
      expect(wide.statements).toHaveLength(narrow.statements.length);
      expect(narrowAudit.affectedEntities.raffleEvents).toBe(12);
      expect(wideAudit.affectedEntities.raffleEvents).toBe(1200);
      expect(wideAudit.replayCursor).toBe(7999);
    });

    it('rewinds the cursor to one ledger before the rollback point', async () => {
      const h = buildHarness({ fromLedger: 4200 });

      const audit = await h.service.rollback(4200);

      expect(audit.replayCursor).toBe(4199);
      expect(h.one('update.platform_state').params).toEqual([4199, 4200]);
      expect(h.one('update.indexer_cursor').params).toEqual([4200, 4199]);
    });

    it('trims the ledger-hash ring to the replayable ledgers only', async () => {
      const h = buildHarness({ fromLedger: 4200 });

      await h.service.rollback(4200);

      // Hashes at or after the reorg point must go, or the next poll compares
      // against a chain that no longer exists.
      expect(h.one('update.indexer_cursor').sql).toContain("(elem->>'ledger')::int < $1");
      expect(h.one('update.indexer_cursor').sql).toContain('last_ledger = $2');
    });

    it('clamps the replay cursor at zero when rolling back to genesis', async () => {
      const h = buildHarness({ fromLedger: 0 });

      const audit = await h.service.rollback(0);

      expect(audit.replayCursor).toBe(0);
      expect(h.one('update.platform_state').params).toEqual([0, 0]);
      expect(h.one('update.indexer_cursor').params).toEqual([0, 0]);
    });
  });

  describe('derived state correction', () => {
    it('recomputes user aggregates from the surviving rows instead of adjusting them', async () => {
      const h = buildHarness({ fromLedger: 4200 });

      await h.service.rollback(4200);

      const update = h.one('update.users');
      // Recompute, not increment/decrement: that is what makes a second
      // rollback over the same range a no-op instead of a double subtraction.
      expect(update.sql).toContain('total_tickets_bought = ( SELECT COALESCE(COUNT(*), 0)');
      expect(update.sql).toContain('total_raffles_won = ( SELECT COALESCE(COUNT(*), 0)');
      expect(update.sql).not.toMatch(/total_tickets_bought\s*=\s*total_tickets_bought/);
      expect(update.sql).not.toMatch(/[-+]\s*1\b/);
      // Deliberately unscoped: the whole surviving table is re-derived, so the
      // rollback cannot leave counters at their post-reorg values.
      expect(update.params).toEqual([]);
    });

    it('removes users that the rollback left without any activity', async () => {
      const h = buildHarness({ fromLedger: 4200 });

      await h.service.rollback(4200);

      const orphanDelete = h.one('delete.users');
      expect(orphanDelete.sql).toContain('NOT EXISTS (SELECT 1 FROM tickets');
      expect(orphanDelete.sql).toContain('NOT EXISTS (SELECT 1 FROM raffles');
      expect(orphanDelete.params).toEqual([]);
    });

    it('drops affected platform stats for recomputation rather than decrementing them', async () => {
      const h = buildHarness({
        fromLedger: 4200,
        affectedDates: [{ date: '2026-03-01' }, { date: '2026-03-02' }],
      });

      const audit = await h.service.rollback(4200);

      expect(audit.affectedEntities.platformStats).toBe(2);
      expect(h.of('delete.platform_stats')).toEqual([
        expect.objectContaining({ params: ['2026-03-01'] }),
        expect.objectContaining({ params: ['2026-03-02'] }),
      ]);
      // No UPDATE: the cron rebuilds the rows from the corrected tables.
      expect(h.statements.some((s) => s.sql.startsWith('UPDATE platform_stats'))).toBe(false);
    });

    it('does not touch platform stats when the rollback affected no dates', async () => {
      const h = buildHarness({ fromLedger: 4200, affectedDates: [] });

      const audit = await h.service.rollback(4200);

      expect(audit.affectedEntities.platformStats).toBe(0);
      expect(h.of('delete.platform_stats')).toHaveLength(0);
    });

    it('re-derives aggregates only after the rows they derive from are gone', async () => {
      const h = buildHarness({
        fromLedger: 4200,
        affectedUsers: [{ address: 'user1' }],
        affectedDates: [{ date: '2026-03-01' }],
      });

      await h.service.rollback(4200);

      const emitted = h.statements.map((s) => s.kind);
      const positions = CANONICAL_ORDER.map((kind) => emitted.indexOf(kind));
      expect(positions).not.toContain(-1);
      // Each step reads state the previous one wrote, so the order is part of
      // the contract, not an implementation detail.
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      expect(h.at('delete.raffles')).toBeLessThan(h.at('update.users'));
      expect(h.at('update.users')).toBeLessThan(h.at('delete.users'));
      expect(h.at('delete.users')).toBeLessThan(h.at('update.indexer_cursor'));
    });
  });

  describe('archive boundary', () => {
    /**
     * `docs/database/raffle-events-retention.md`: the archiver deletes
     * `raffle_events` rows older than `RAFFLE_EVENTS_RETENTION_DAYS` from
     * Postgres after writing CSV, and explicitly does not touch derived state.
     * A rollback that reaches past the cutoff can therefore only see the hot
     * rows, and the archived copy has to be re-imported out of band.
     */
    it('issues no archive checkpoint lookup, so archived events stay out of scope', async () => {
      const h = buildHarness({
        fromLedger: 100,
        counts: { raffleEvents: 0, tickets: 7, raffles: 2, deadLetterEvents: 1 },
      });

      await h.service.rollback(100);

      expect(h.statements.some((s) => s.sql.includes('archive_checkpoints'))).toBe(false);
      expect(h.statements.some((s) => s.sql.includes('archives'))).toBe(false);
    });

    it('rolls derived state back across the boundary but reports hot events only', async () => {
      const h = buildHarness({
        fromLedger: 100,
        // The archived raw events are gone from the hot table; the derived rows
        // they produced are not archived, so those are still deleted.
        counts: { raffleEvents: 0, tickets: 9, raffles: 4, deadLetterEvents: 0 },
        affectedUsers: [{ address: 'archived-user' }],
      });

      const audit = await h.service.rollback(100);

      expect(audit.success).toBe(true);
      expect(audit.affectedEntities).toMatchObject({
        raffleEvents: 0,
        tickets: 9,
        raffles: 4,
      });
      // The range is still expressed in full: the service does not narrow the
      // delete to the archived watermark, because it does not know it.
      expect(h.one('delete.raffle_events').sql).toContain('ledger >= $1');
      expect(h.one('delete.raffle_events').params).toEqual([100]);
    });

    it('completes without error when the target ledger is already archived', async () => {
      const h = buildHarness({
        fromLedger: 50,
        counts: { raffleEvents: 0, tickets: 0, raffles: 0, deadLetterEvents: 0 },
      });

      const audit = await h.service.rollback(50);

      expect(audit.success).toBe(true);
      expect(audit.replayCursor).toBe(49);
      expect(h.one('update.indexer_cursor').params).toEqual([50, 49]);
    });
  });

  describe('idempotency', () => {
    it('is safe to run twice over the same range', async () => {
      const h = buildHarness({ fromLedger: 4200, counts: { raffleEvents: 5 } });

      const first = await h.service.rollback(4200);
      const second = await h.service.rollback(4200);

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      expect(second.replayCursor).toBe(first.replayCursor);
      expect(h.of('update.users')).toHaveLength(2);
    });

    it('reports zero affected rows on a replay that finds nothing left', async () => {
      const h = buildHarness({ fromLedger: 4200, counts: { raffleEvents: 5, tickets: 5 } });

      const first = await h.service.rollback(4200);
      // The deletes have already run, so the second pass counts nothing.
      h.setCounts({ raffleEvents: 0, tickets: 0, raffles: 0, deadLetterEvents: 0 });
      const second = await h.service.rollback(4200);

      expect(first.affectedEntities.raffleEvents).toBe(5);
      expect(second.affectedEntities.raffleEvents).toBe(0);
      expect(second.success).toBe(true);
    });
  });

  describe('transaction boundary and failure audit', () => {
    it('runs every statement on the transaction manager', async () => {
      const h = buildHarness({ fromLedger: 4200 });

      await h.service.rollback(4200);

      expect(h.dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(h.manager.query).toHaveBeenCalled();
      expect(h.dataSource.query).not.toHaveBeenCalled();
    });

    it('returns a completed audit entry on success', async () => {
      const h = buildHarness({ fromLedger: 4200 });

      const audit: RollbackAuditEntry = await h.service.rollback(4200);

      expect(audit.success).toBe(true);
      expect(audit.fromLedger).toBe(4200);
      expect(audit.completedAt).toBeInstanceOf(Date);
      expect(audit.durationMs).toBeGreaterThanOrEqual(0);
      expect(audit.errorMessage).toBeUndefined();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Reorg rollback completed'));
    });

    it('rethrows the original error and records it in the failure audit', async () => {
      const failure = new Error('deadlock detected');
      const h = buildHarness({
        fromLedger: 4200,
        failWhen: (sql) => sql.startsWith('DELETE FROM tickets'),
        failure,
      });

      await expect(h.service.rollback(4200)).rejects.toBe(failure);

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Reorg rollback starting'));
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reorg rollback failed: ledger 4200, error: deadlock detected'),
      );
    });

    it('never moves the cursor when an earlier statement fails', async () => {
      const h = buildHarness({
        fromLedger: 4200,
        failWhen: (sql) => sql.startsWith('DELETE FROM raffles'),
        failure: new Error('constraint violation'),
      });

      await expect(h.service.rollback(4200)).rejects.toThrow('constraint violation');

      // The cursor and platform state are written last precisely so that a
      // failure anywhere earlier leaves the replay position untouched.
      expect(h.of('update.indexer_cursor')).toHaveLength(0);
      expect(h.of('update.platform_state')).toHaveLength(0);
    });

    it('reports a non-Error rejection as a string in the audit', async () => {
      const h = buildHarness({
        fromLedger: 4200,
        failWhen: (sql) => sql.startsWith('DELETE FROM raffle_events'),
        failure: 'connection terminated',
      });

      await expect(h.service.rollback(4200)).rejects.toBe('connection terminated');

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('error: connection terminated'),
      );
    });
  });
});
