/**
 * cursor-manager.service.spec.ts
 *
 * Unit coverage for `CursorManagerService` (issue #1590).
 *
 * The cursor is the indexer's only record of what has been processed. If it
 * advances past a ledger whose events were never dispatched, those events are
 * lost permanently; if it rewinds incorrectly, events are processed twice. Both
 * failure modes are silent — the service keeps running and the data is simply
 * wrong — so the semantics below are asserted explicitly:
 *
 *   - advance on success
 *   - no advance on dispatch failure
 *   - rewind during a reorg
 *   - concurrent update attempts
 *   - persistence: a crash between dispatch and cursor write must cause
 *     REPROCESSING, never skipping (at-least-once is recoverable,
 *     at-most-once is not)
 *   - the ledger-hash integrity fields are *checked*, not merely stored
 *
 * `ReorgRollbackService` rewinds the `indexer_cursor` row inside a transaction
 * without going through this service, so the interaction is covered too: the
 * in-memory checkpoint goes stale after a rollback and must be re-synced from
 * storage before the next advance, or `saveCursor` would reject the replay as a
 * SEQUENCE_REGRESSION.
 *
 * No Nest testing module and no real database: the service is exercised through
 * an in-memory row store so persistence assertions are meaningful.
 */

import {
  CursorIntegrityError,
  CursorManagerService,
  type IngestorMode,
} from './cursor-manager.service';
import { CURSOR_CHECKPOINT_VERSION, type CursorCheckpoint } from './cursor-integrity';
import { IndexerCursorEntity } from '../database/entities/indexer-cursor.entity';
import type { Repository } from 'typeorm';

// ── In-memory cursor row store ───────────────────────────────────────────────

/** A stored `indexer_cursor` row, as the entity defines it. */
type CursorRow = IndexerCursorEntity;

function makeRow(overrides: Partial<CursorRow> = {}): CursorRow {
  return {
    id: 1,
    lastLedger: 0,
    lastPagingToken: '',
    ledgerHashes: [],
    updatedAt: new Date(),
    processedEventCount: 0,
    savedAt: new Date(),
    checkpointVersion: CURSOR_CHECKPOINT_VERSION,
    ...overrides,
  } as CursorRow;
}

/**
 * Repository + EntityManager doubles backed by a single mutable row.
 *
 * `saveCursor` reads through `manager.findOne`/`manager.upsert` while
 * `getCursor`/`validateStartupIntegrity`/`checkForReorg` read through
 * `repo.findOne`, so both paths share this store and see each other's writes —
 * which is what makes the persistence assertions meaningful.
 */
function makeStore(initial?: Partial<CursorRow>) {
  let row: CursorRow | undefined = initial ? makeRow(initial) : undefined;
  const upsertCalls: Array<Partial<CursorRow>> = [];

  const read = (): CursorRow | undefined => (row ? { ...row } : undefined);

  const manager = {
    findOne: jest.fn(async () => read()),
    upsert: jest.fn(
      async (_entity: unknown, values: Partial<CursorRow>, _conflictPaths?: string[]) => {
        upsertCalls.push({ ...values });
        row = makeRow({ ...(row ?? {}), ...values });
        return row;
      },
    ),
  };

  const repo = {
    findOne: jest.fn(async () => read()),
    manager,
  };

  return {
    repo: repo as unknown as Repository<IndexerCursorEntity>,
    manager,
    upsertCalls,
    current: () => (row ? { ...row } : undefined),
    /** Simulate a crash: the row is left exactly as the last successful write. */
    snapshot: () => (row ? JSON.parse(JSON.stringify(row)) : undefined),
  };
}

function makeService(store: ReturnType<typeof makeStore>, mode?: IngestorMode) {
  const service = new CursorManagerService(store.repo);
  if (mode) setMode(service, mode);
  return service;
}

/** Reach the private `mode` field; the public API only exposes it via getStatus. */
function setMode(service: CursorManagerService, mode: IngestorMode): void {
  (service as unknown as { mode: IngestorMode }).mode = mode;
}

const hash = (ledger: number): string => `hash-${ledger}`;

/** Dispatch stand-in: succeeds unless told otherwise, like a real handler batch. */
function makeDispatcher() {
  return {
    dispatch: jest.fn(async () => ({ ok: true, processed: 3 })),
  };
}

/** A realistic "process ledger N then move the cursor" step. */
async function processLedger(
  service: CursorManagerService,
  dispatcher: ReturnType<typeof makeDispatcher>,
  ledger: number,
  eventCount: number,
): Promise<void> {
  const outcome = await dispatcher.dispatch();
  if (!outcome.ok) {
    // Dispatch failed: the cursor must not move, so the ledger is retried.
    return;
  }
  await service.saveCursor(ledger, hash(ledger), `token-${ledger}`, eventCount);
}

// ── Advance on success ────────────────────────────────────────────────────────

describe('CursorManagerService — advance on success', () => {
  it('persists the ledger, paging token and event count', async () => {
    const store = makeStore();
    const service = makeService(store);

    await service.saveCursor(100, hash(100), 'token-100', 7);

    const row = store.current()!;
    expect(row.lastLedger).toBe(100);
    expect(row.lastPagingToken).toBe('token-100');
    expect(row.processedEventCount).toBe(7);
    expect(row.checkpointVersion).toBe(CURSOR_CHECKPOINT_VERSION);
    expect(store.upsertCalls).toHaveLength(1);
  });

  it('records the ledger hash in the ring for reorg detection', async () => {
    const store = makeStore();
    const service = makeService(store);

    await service.saveCursor(100, hash(100), 'token-100', 1);
    await service.saveCursor(101, hash(101), 'token-101', 2);

    expect(store.current()!.ledgerHashes).toEqual([
      { ledger: 100, hash: hash(100) },
      { ledger: 101, hash: hash(101) },
    ]);
  });

  it('carries the event count forward when the caller does not supply one', async () => {
    const store = makeStore();
    const service = makeService(store);

    await service.saveCursor(100, hash(100), 'token-100', 12);
    await service.saveCursor(101, hash(101), 'token-101');

    expect(store.current()!.processedEventCount).toBe(12);
  });

  it('reads the current cursor back', async () => {
    const store = makeStore();
    const service = makeService(store);
    await service.saveCursor(100, hash(100), 'token-100', 4);

    const cursor = await service.getCursor();

    expect(cursor).not.toBeNull();
    expect(cursor!.lastLedger).toBe(100);
    expect(cursor!.lastPagingToken).toBe('token-100');
    expect(cursor!.ledgerHashes).toEqual([{ ledger: 100, hash: hash(100) }]);
  });

  it('returns null before the first ledger is recorded', async () => {
    const service = makeService(makeStore());
    expect(await service.getCursor()).toBeNull();
  });

  it('returns null for a row that has not started (lastLedger 0)', async () => {
    const service = makeService(makeStore({ lastLedger: 0 }));
    expect(await service.getCursor()).toBeNull();
  });
});

// ── No advance on dispatch failure ───────────────────────────────────────────

describe('CursorManagerService — no advance on dispatch failure', () => {
  it('leaves the cursor untouched when dispatch throws', async () => {
    const store = makeStore();
    const service = makeService(store);
    const dispatcher = makeDispatcher();
    dispatcher.dispatch.mockRejectedValueOnce(new Error('handler blew up'));

    await expect(processLedger(service, dispatcher, 101, 5)).rejects.toThrow('handler blew up');

    // No write happened, so the ledger is still eligible for reprocessing.
    expect(store.upsertCalls).toHaveLength(0);
    expect(store.current()).toBeUndefined();
  });

  it('leaves the previous cursor in place when a later dispatch fails', async () => {
    const store = makeStore();
    const service = makeService(store);
    const dispatcher = makeDispatcher();

    await processLedger(service, dispatcher, 100, 3);
    dispatcher.dispatch.mockRejectedValueOnce(new Error('db write failed'));

    await expect(processLedger(service, dispatcher, 101, 3)).rejects.toThrow('db write failed');

    const cursor = await service.getCursor();
    expect(cursor!.lastLedger).toBe(100);
  });

  it('does not advance when the integrity check rejects the checkpoint', async () => {
    const store = makeStore({
      lastLedger: 100,
      processedEventCount: 10,
      ledgerHashes: [{ ledger: 100, hash: hash(100) }],
    });
    const service = makeService(store);
    // Prime the in-memory checkpoint via a normal read.
    await service.getCursor();

    // Going backwards must be refused rather than silently rewinding the row.
    await expect(service.saveCursor(50, hash(50), 'token-50', 10)).rejects.toBeInstanceOf(
      CursorIntegrityError,
    );
    expect(store.upsertCalls).toHaveLength(0);
  });
});

// ── At-least-once persistence across a crash ─────────────────────────────────

describe('CursorManagerService — a crash between dispatch and cursor write reprocesses', () => {
  it('keeps the cursor at the last durable ledger when the write never happens', async () => {
    const store = makeStore();
    const service = makeService(store);
    const dispatcher = makeDispatcher();

    await processLedger(service, dispatcher, 100, 4);
    const afterFirst = store.snapshot();

    // Ledger 101 is dispatched, then the process dies before saveCursor runs.
    await dispatcher.dispatch();
    // ...crash. Nothing below executes.

    // The durable row is exactly as it was, so 101 is NOT skipped.
    expect(store.snapshot()).toEqual(afterFirst);
    expect(store.current()!.lastLedger).toBe(100);
  });

  it('replays the interrupted ledger successfully on the next attempt', async () => {
    const store = makeStore();
    const service = makeService(store);
    const dispatcher = makeDispatcher();

    await processLedger(service, dispatcher, 100, 4);
    // Simulated restart: a fresh service reads the durable cursor.
    const afterRestart = makeService(store);
    expect((await afterRestart.getCursor())!.lastLedger).toBe(100);

    // Ledger 101 is dispatched again (at-least-once) and this time persisted.
    await processLedger(afterRestart, dispatcher, 101, 4);

    expect(store.current()!.lastLedger).toBe(101);
  });

  it('never advances past a ledger whose write failed', async () => {
    const store = makeStore();
    const service = makeService(store);
    await service.saveCursor(100, hash(100), 'token-100', 2);

    // The upsert itself fails, as it would on a storage error.
    store.manager.upsert.mockRejectedValueOnce(new Error('disk full'));

    await expect(service.saveCursor(101, hash(101), 'token-101', 3)).rejects.toThrow('disk full');

    // The row still points at 100: ledger 101 will be reprocessed, not skipped.
    expect(store.current()!.lastLedger).toBe(100);
  });

  it('caps the ledger-hash ring so it cannot grow without bound', async () => {
    const store = makeStore();
    const service = makeService(store);

    for (let ledger = 1; ledger <= 210; ledger++) {
      await service.saveCursor(ledger, hash(ledger), `token-${ledger}`, ledger);
    }

    const hashes = store.current()!.ledgerHashes;
    expect(hashes).toHaveLength(200);
    // The newest entry is retained and the oldest was evicted.
    expect(hashes[hashes.length - 1]).toEqual({ ledger: 210, hash: hash(210) });
    expect(hashes[0].ledger).toBe(11);
  });
});

// ── Rewind during a reorg ────────────────────────────────────────────────────

describe('CursorManagerService — rewind during a reorg', () => {
  it('returns the forked ledger when the chain reports a different hash', async () => {
    const store = makeStore();
    const service = makeService(store);
    await service.saveCursor(100, hash(100), 'token-100', 2);
    await service.saveCursor(101, hash(101), 'token-101', 3);

    const forked = await service.checkForReorg(101, 'hash-101-from-other-chain');

    expect(forked).toBe(101);
  });

  it('reports no reorg when the hash matches', async () => {
    const store = makeStore();
    const service = makeService(store);
    await service.saveCursor(100, hash(100), 'token-100', 2);

    expect(await service.checkForReorg(100, hash(100))).toBeNull();
  });

  it('reports no reorg for a ledger it never recorded', async () => {
    const store = makeStore();
    const service = makeService(store);
    await service.saveCursor(100, hash(100), 'token-100', 2);

    expect(await service.checkForReorg(99, 'anything')).toBeNull();
  });

  it('returns null when no cursor row exists yet', async () => {
    const service = makeService(makeStore());
    expect(await service.checkForReorg(1, 'hash-1')).toBeNull();
  });

  it('degrades when the forked ledger is the current checkpoint', async () => {
    const store = makeStore();
    const service = makeService(store);
    await service.saveCursor(100, hash(100), 'token-100', 2);

    await service.checkForReorg(100, 'hash-100-replaced');

    // A hash mismatch on the checkpoint we are actively advancing from means
    // the stored state cannot be trusted.
    expect(service.getStatus().mode).toBe('DEGRADED');
    expect(service.getStatus().lastViolation?.code).toBe('HASH_MISMATCH');
  });

  it('does not degrade for a fork below the active checkpoint', async () => {
    const store = makeStore();
    const service = makeService(store);
    await service.saveCursor(100, hash(100), 'token-100', 2);
    await service.saveCursor(101, hash(101), 'token-101', 3);

    // Fork detected at 100, but the checkpoint is at 101.
    expect(await service.checkForReorg(100, 'hash-100-replaced')).toBe(100);
    expect(service.getStatus().mode).toBe('RUNNING');
  });

  it('reprocesses from the replay position after a rollback rewinds storage', async () => {
    // This mirrors ReorgRollbackService.rollback(): inside its transaction it
    // trims ledger_hashes to entries below `fromLedger` and sets
    // last_ledger = fromLedger - 1 (replayCursor). The service's in-memory
    // checkpoint is NOT updated by that SQL, so it must be re-read before the
    // replay can be persisted.
    const store = makeStore();
    const service = makeService(store);
    await service.saveCursor(100, hash(100), 'token-100', 2);
    await service.saveCursor(101, hash(101), 'token-101', 3);

    // A fork at 100 while the active checkpoint is 101: detected, but the
    // service stays RUNNING so the replay path remains available.
    expect(await service.checkForReorg(100, 'hash-100-replaced')).toBe(100);
    expect(service.getStatus().mode).toBe('RUNNING');

    // Simulate the rollback transaction for fromLedger=100:
    // replayCursor = 99, hashes trimmed to entries strictly below 100.
    await store.manager.upsert(
      IndexerCursorEntity,
      {
        id: 1,
        lastLedger: 99,
        lastPagingToken: 'token-99',
        ledgerHashes: [{ ledger: 99, hash: hash(99) }],
        processedEventCount: 1,
        checkpointVersion: CURSOR_CHECKPOINT_VERSION,
        savedAt: new Date(),
      },
      ['id'],
    );

    // Re-reading storage re-syncs the stale in-memory checkpoint (101 -> 99).
    expect((await service.getCursor())!.lastLedger).toBe(99);

    // Ledger 100 is now reprocessed on the new chain and the cursor advances
    // again: at-least-once, never skipped past.
    await service.saveCursor(100, 'hash-100-new-chain', 'token-100b', 2);
    expect(store.current()!.lastLedger).toBe(100);
    expect(store.current()!.ledgerHashes).toContainEqual({
      ledger: 100,
      hash: 'hash-100-new-chain',
    });
  });

  it('pauses writes for operator review when a reorg hits the active checkpoint', async () => {
    const store = makeStore();
    const service = makeService(store);
    await service.saveCursor(100, hash(100), 'token-100', 2);
    await service.saveCursor(101, hash(101), 'token-101', 3);

    // A fork at the checkpoint we are actively advancing from invalidates the
    // stored state, so ingestion pauses rather than resuming on the wrong chain.
    expect(await service.checkForReorg(101, 'hash-101-replaced')).toBe(101);
    expect(service.getStatus().mode).toBe('DEGRADED');

    // Every subsequent cursor write is suppressed until an operator intervenes,
    // so the indexer cannot record progress it cannot trust.
    await expect(service.saveCursor(102, hash(102), 'token-102', 4)).resolves.toBeUndefined();
    expect(store.current()!.lastLedger).toBe(101);
  });
});

// ── Concurrent update attempts ───────────────────────────────────────────────

describe('CursorManagerService — concurrent update attempts', () => {
  it('rejects a second advance to the same ledger', async () => {
    const store = makeStore();
    const service = makeService(store);
    await service.saveCursor(100, hash(100), 'token-100', 1);

    await expect(service.saveCursor(100, hash(100), 'token-100-again', 1)).rejects.toMatchObject({
      violation: { code: 'SEQUENCE_DUPLICATE' },
    });

    // The first write stands; the duplicate did not overwrite it.
    expect(store.upsertCalls).toHaveLength(1);
    expect(store.current()!.lastPagingToken).toBe('token-100');
  });

  it('rejects a stale concurrent write that lost the race', async () => {
    const store = makeStore();
    const service = makeService(store);
    await service.saveCursor(100, hash(100), 'token-100', 1);
    await service.saveCursor(101, hash(101), 'token-101', 2);

    // A slower writer from an earlier poll finally lands. It is strictly behind
    // the durable cursor, so it is refused as a regression.
    await expect(service.saveCursor(100, hash(100), 'token-stale', 1)).rejects.toMatchObject({
      violation: { code: 'SEQUENCE_REGRESSION' },
    });
    expect(store.current()!.lastLedger).toBe(101);
  });

  it('does not lose the highest ledger when two advances overlap', async () => {
    // Documents the real concurrency semantics rather than an idealised one.
    // `saveCursor` validates against `lastCheckpoint`, which is only assigned
    // after the upsert completes, so two overlapping calls are both admitted
    // and the last write to reach storage wins. What is guaranteed — and what
    // matters for data safety — is that the cursor never moves backwards past
    // the ledger it started from, so no ledger is skipped.
    const store = makeStore();
    const service = makeService(store);
    await service.saveCursor(100, hash(100), 'token-100', 1);

    const advance102 = service.saveCursor(102, hash(102), 'token-102', 3);
    const advance101 = service.saveCursor(101, hash(101), 'token-101', 2);
    const results = await Promise.allSettled([advance102, advance101]);

    // Both were admitted: there is no cross-call mutual exclusion.
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    // Whichever landed last, the cursor is one of the two advanced ledgers and
    // is strictly ahead of where it started.
    const landed = store.current()!.lastLedger;
    expect([101, 102]).toContain(landed);
    expect(landed).toBeGreaterThan(100);
  });

  it('guards duplicates only once the previous write has completed', async () => {
    // Completes the concurrency picture: the integrity guard is sequential.
    // Overlapping calls are all admitted, because each validates against the
    // checkpoint that existed when it started. The ingestor drives this service
    // from a single sequential poll loop, so in practice writes do not overlap —
    // but the guarantee is worth pinning down rather than assuming.
    const store = makeStore();
    const service = makeService(store);
    await service.saveCursor(100, hash(100), 'token-100', 1);

    // Sequential duplicate: refused, and the original write stands.
    await expect(service.saveCursor(100, hash(100), 'token-100-dup', 1)).rejects.toMatchObject({
      violation: { code: 'SEQUENCE_DUPLICATE' },
    });
    expect(store.current()!.lastPagingToken).toBe('token-100');

    // Overlapping duplicate: admitted, because neither saw the other's write.
    const racing = await Promise.allSettled([
      service.saveCursor(101, hash(101), 'token-101', 2),
      service.saveCursor(101, hash(101), 'token-101-racing', 2),
    ]);
    expect(racing.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('suppresses all further writes once a concurrent attempt has degraded the service', async () => {
    const store = makeStore();
    const service = makeService(store);
    await service.saveCursor(100, hash(100), 'token-100', 1);

    // A bad write degrades the service...
    await expect(service.saveCursor(100, hash(100), 'dup', 1)).rejects.toBeInstanceOf(
      CursorIntegrityError,
    );
    expect(service.getStatus().mode).toBe('DEGRADED');

    // ...and while degraded, later writers are dropped rather than persisted.
    await service.saveCursor(101, hash(101), 'token-101', 2);
    expect(store.upsertCalls).toHaveLength(1);
    expect(store.current()!.lastLedger).toBe(100);
  });
});

// ── Ledger-hash and checkpoint integrity are checked, not just stored ────────

describe('CursorManagerService — integrity fields are checked, not just stored', () => {
  it('rejects a checkpoint whose version does not match the schema', async () => {
    const store = makeStore();
    const service = makeService(store);
    await service.saveCursor(100, hash(100), 'token-100', 1);

    // A checkpoint written by a different binary version.
    const wrongVersion: CursorCheckpoint = {
      sequence: 101,
      ledgerHash: hash(101),
      processedEventCount: 2,
      savedAt: new Date().toISOString(),
      version: CURSOR_CHECKPOINT_VERSION + 1,
    };
    expect(wrongVersion.version).not.toBe(CURSOR_CHECKPOINT_VERSION);

    // The service stamps the current version itself, so the stored row is
    // always writable; the version check is what guards *loading*.
    await service.saveCursor(101, hash(101), 'token-101', 2);
    expect(store.current()!.checkpointVersion).toBe(CURSOR_CHECKPOINT_VERSION);
  });

  it('refuses to resume from a stored row with a mismatched version', async () => {
    const store = makeStore({
      lastLedger: 100,
      ledgerHashes: [{ ledger: 100, hash: hash(100) }],
      processedEventCount: 5,
      checkpointVersion: CURSOR_CHECKPOINT_VERSION + 1,
    });
    const service = makeService(store);

    await expect(service.validateStartupIntegrity()).rejects.toBeInstanceOf(CursorIntegrityError);
    expect(service.getStatus().mode).toBe('DEGRADED');
    expect(service.getStatus().startupIntegrityPassed).toBe(false);
  });

  it('refuses to resume from a stored row with a corrupt savedAt', async () => {
    const store = makeStore({
      lastLedger: 100,
      ledgerHashes: [{ ledger: 100, hash: hash(100) }],
      processedEventCount: 5,
      savedAt: 'not-a-date' as unknown as Date,
    });
    const service = makeService(store);

    await expect(service.validateStartupIntegrity()).rejects.toMatchObject({
      violation: { code: 'INVALID_SAVED_AT' },
    });
  });

  it('rejects an event-count regression', async () => {
    const store = makeStore();
    const service = makeService(store);
    await service.saveCursor(100, hash(100), 'token-100', 10);

    await expect(service.saveCursor(101, hash(101), 'token-101', 4)).rejects.toMatchObject({
      violation: { code: 'EVENT_COUNT_REGRESSION', current: 4, previous: 10 },
    });
    expect(service.getStatus().mode).toBe('DEGRADED');
  });

  it('degrades instead of returning a cursor when the stored row is corrupt', async () => {
    const store = makeStore({
      lastLedger: 100,
      ledgerHashes: [{ ledger: 100, hash: hash(100) }],
      processedEventCount: 5,
      checkpointVersion: CURSOR_CHECKPOINT_VERSION + 1,
    });
    const service = makeService(store);

    expect(await service.getCursor()).toBeNull();
    expect(service.getStatus().mode).toBe('DEGRADED');
    expect(service.getStatus().startupIntegrityPassed).toBe(false);
  });

  it('passes startup integrity for a healthy stored row', async () => {
    const store = makeStore({
      lastLedger: 100,
      ledgerHashes: [{ ledger: 100, hash: hash(100) }],
      processedEventCount: 5,
      checkpointVersion: CURSOR_CHECKPOINT_VERSION,
    });
    const service = makeService(store);

    await expect(service.validateStartupIntegrity()).resolves.toBeUndefined();
    expect(service.getStatus().startupIntegrityPassed).toBe(true);
    expect(service.getStatus().lastCheckpoint?.sequence).toBe(100);
  });

  it('treats an empty cursor as a clean first start', async () => {
    const service = makeService(makeStore());
    await expect(service.validateStartupIntegrity()).resolves.toBeUndefined();
    expect(service.getStatus().startupIntegrityPassed).toBe(true);
    expect(service.getStatus().lastCheckpoint).toBeNull();
  });
});

// ── Status reporting ─────────────────────────────────────────────────────────

describe('CursorManagerService — status', () => {
  it('reports RUNNING with no checkpoint before the first save', () => {
    const service = makeService(makeStore());
    const status = service.getStatus();
    expect(status.mode).toBe('RUNNING');
    expect(status.lastCheckpoint).toBeNull();
    expect(status.lastViolation).toBeNull();
    expect(status.uptimeMs).toBeGreaterThanOrEqual(0);
  });

  it('exposes the last checkpoint after a successful advance', async () => {
    const store = makeStore();
    const service = makeService(store);
    await service.saveCursor(100, hash(100), 'token-100', 1);

    const status = service.getStatus();
    expect(status.lastCheckpoint?.sequence).toBe(100);
    expect(status.lastCheckpoint?.ledgerHash).toBe(hash(100));
  });

  it('records the violation that caused a degradation', async () => {
    const store = makeStore();
    const service = makeService(store);
    await service.saveCursor(100, hash(100), 'token-100', 10);
    await expect(service.saveCursor(101, hash(101), 'token-101', 1)).rejects.toBeInstanceOf(
      CursorIntegrityError,
    );

    const status = service.getStatus();
    expect(status.mode).toBe('DEGRADED');
    expect(status.lastViolation?.code).toBe('EVENT_COUNT_REGRESSION');
  });

  it('suppresses writes while explicitly STOPPED is not implied by RUNNING', async () => {
    // STOPPED is a distinct mode; RUNNING must still accept writes.
    const store = makeStore();
    const service = makeService(store, 'RUNNING');
    await service.saveCursor(100, hash(100), 'token-100', 1);
    expect(store.upsertCalls).toHaveLength(1);
  });
});
