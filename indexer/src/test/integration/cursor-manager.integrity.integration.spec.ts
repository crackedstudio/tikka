/**
 * cursor-manager.integrity.integration.spec.ts
 *
 * Integration tests for the checkpoint integrity checks added in issue #560.
 * Uses a real PostgreSQL container (via Testcontainers) so every assertion
 * exercises the full DB round-trip.
 *
 * Scenarios:
 *   1. validateOnLoad — corrupt stored checkpoint → DEGRADED, getCursor returns null
 *   2. validateOnLoad — version mismatch → DEGRADED
 *   3. validateBeforeSave — sequence regression → throws CursorIntegrityError, mode DEGRADED
 *   4. validateBeforeSave — duplicate sequence → throws CursorIntegrityError
 *   5. validateBeforeSave — event count regression → throws CursorIntegrityError
 *   6. DEGRADED mode suppresses subsequent writes
 *   7. Hash mismatch via checkForReorg → mode DEGRADED
 *   8. getStatus() reflects lastCheckpoint and lastViolation after a violation
 *   9. processedEventCount is persisted and read back correctly
 *  10. savedAt and checkpointVersion are persisted correctly
 */

import { DataSource } from 'typeorm';
import { IndexerCursorEntity } from '../../database/entities/indexer-cursor.entity';
import {
  CursorManagerService,
  CursorIntegrityError,
} from '../../ingestor/cursor-manager.service';
import { CURSOR_CHECKPOINT_VERSION } from '../../ingestor/cursor-integrity';
import {
  startDb,
  stopDb,
  DbContainerContext,
  CONTAINER_STARTUP_MS,
} from './helpers/db-container';

// ─── Lifecycle ────────────────────────────────────────────────────────────────

let ctx: DbContainerContext;
let dataSource: DataSource;

beforeAll(async () => {
  ctx = await startDb();
  dataSource = ctx.dataSource;
}, CONTAINER_STARTUP_MS);

afterAll(async () => stopDb(ctx));

beforeEach(async () => {
  await dataSource.query(`TRUNCATE TABLE indexer_cursor RESTART IDENTITY`);
});

/** Fresh service instance — resets all in-memory state. */
function makeService(): CursorManagerService {
  return new CursorManagerService(dataSource.getRepository(IndexerCursorEntity));
}

/** Directly upsert a raw cursor row, bypassing service validation. */
async function rawUpsert(fields: Partial<IndexerCursorEntity>): Promise<void> {
  await dataSource.query(
    `INSERT INTO indexer_cursor
       (id, last_ledger, last_paging_token, ledger_hashes,
        processed_event_count, saved_at, checkpoint_version)
     VALUES (1, $1, $2, $3::jsonb, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       last_ledger = EXCLUDED.last_ledger,
       last_paging_token = EXCLUDED.last_paging_token,
       ledger_hashes = EXCLUDED.ledger_hashes,
       processed_event_count = EXCLUDED.processed_event_count,
       saved_at = EXCLUDED.saved_at,
       checkpoint_version = EXCLUDED.checkpoint_version`,
    [
      fields.lastLedger ?? 100,
      fields.lastPagingToken ?? '',
      JSON.stringify(fields.ledgerHashes ?? [{ ledger: 100, hash: 'abc' }]),
      fields.processedEventCount ?? 0,
      fields.savedAt ?? new Date(),
      fields.checkpointVersion ?? CURSOR_CHECKPOINT_VERSION,
    ],
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CursorManagerService — integrity integration tests', () => {
  it('1. corrupt checkpoint_version on load → DEGRADED, getCursor returns null', async () => {
    await rawUpsert({ checkpointVersion: 99 });
    const svc = makeService();
    const cursor = await svc.getCursor();
    expect(cursor).toBeNull();
    const { mode, lastViolation } = svc.getStatus();
    expect(mode).toBe('DEGRADED');
    expect(lastViolation?.code).toBe('VERSION_MISMATCH');
  });

  it('2. invalid saved_at on load → DEGRADED', async () => {
    await dataSource.query(
      `INSERT INTO indexer_cursor
         (id, last_ledger, last_paging_token, ledger_hashes,
          processed_event_count, saved_at, checkpoint_version)
       VALUES (1, 100, '', '[]'::jsonb, 0, 'not-a-date', 1)`,
    );
    const svc = makeService();
    const cursor = await svc.getCursor();
    expect(cursor).toBeNull();
    expect(svc.getStatus().mode).toBe('DEGRADED');
    expect(svc.getStatus().lastViolation?.code).toBe('INVALID_SAVED_AT');
  });

  it('3. sequence regression → throws CursorIntegrityError, mode DEGRADED', async () => {
    const svc = makeService();
    await svc.saveCursor(200, 'hash-200', 'tok-200', 10);
    await expect(svc.saveCursor(100, 'hash-100', 'tok-100', 10)).rejects.toThrow(
      CursorIntegrityError,
    );
    expect(svc.getStatus().mode).toBe('DEGRADED');
    expect(svc.getStatus().lastViolation?.code).toBe('SEQUENCE_REGRESSION');
  });

  it('4. duplicate sequence → throws CursorIntegrityError', async () => {
    const svc = makeService();
    await svc.saveCursor(100, 'hash-100', 'tok', 0);
    await expect(svc.saveCursor(100, 'hash-100b', 'tok2', 1)).rejects.toThrow(
      CursorIntegrityError,
    );
    expect(svc.getStatus().lastViolation?.code).toBe('SEQUENCE_DUPLICATE');
  });

  it('5. event count regression → throws CursorIntegrityError', async () => {
    const svc = makeService();
    await svc.saveCursor(100, 'hash-100', 'tok', 50);
    await expect(svc.saveCursor(101, 'hash-101', 'tok2', 49)).rejects.toThrow(
      CursorIntegrityError,
    );
    expect(svc.getStatus().lastViolation?.code).toBe('EVENT_COUNT_REGRESSION');
  });

  it('6. DEGRADED mode suppresses subsequent writes', async () => {
    const svc = makeService();
    await svc.saveCursor(100, 'hash-100', 'tok', 0);
    // Trigger DEGRADED
    try { await svc.saveCursor(50, 'hash-50', 'tok2', 0); } catch { /* expected */ }
    expect(svc.getStatus().mode).toBe('DEGRADED');

    // Attempt a valid-looking write — should be silently suppressed
    await svc.saveCursor(200, 'hash-200', 'tok3', 1);

    // DB must still hold ledger 100
    const row = await dataSource.getRepository(IndexerCursorEntity).findOne({ where: { id: 1 } });
    expect(row?.lastLedger).toBe(100);
  });

  it('7. hash mismatch via checkForReorg → mode DEGRADED', async () => {
    const svc = makeService();
    await svc.saveCursor(100, 'original-hash', 'tok', 0);
    const reorgAt = await svc.checkForReorg(100, 'forked-hash');
    expect(reorgAt).toBe(100);
    expect(svc.getStatus().mode).toBe('DEGRADED');
    expect(svc.getStatus().lastViolation?.code).toBe('HASH_MISMATCH');
  });

  it('8. getStatus() reflects lastCheckpoint and lastViolation after violation', async () => {
    const svc = makeService();
    await svc.saveCursor(100, 'hash-100', 'tok', 5);
    try { await svc.saveCursor(99, 'hash-99', 'tok2', 5); } catch { /* expected */ }

    const status = svc.getStatus();
    expect(status.mode).toBe('DEGRADED');
    expect(status.lastCheckpoint?.sequence).toBe(100);
    expect(status.lastCheckpoint?.processedEventCount).toBe(5);
    expect(status.lastViolation?.code).toBe('SEQUENCE_REGRESSION');
    expect(status.uptimeMs).toBeGreaterThanOrEqual(0);
  });

  it('9. processedEventCount is persisted and read back correctly', async () => {
    const svc = makeService();
    await svc.saveCursor(100, 'hash-100', 'tok', 42);

    const row = await dataSource.getRepository(IndexerCursorEntity).findOne({ where: { id: 1 } });
    expect(Number(row?.processedEventCount)).toBe(42);

    // A fresh service reads it back via getCursor + lastCheckpoint
    const svc2 = makeService();
    await svc2.getCursor();
    expect(svc2.getStatus().lastCheckpoint?.processedEventCount).toBe(42);
  });

  it('10. savedAt and checkpointVersion are persisted correctly', async () => {
    const svc = makeService();
    const before = new Date();
    await svc.saveCursor(100, 'hash-100', 'tok', 0);
    const after = new Date();

    const row = await dataSource.getRepository(IndexerCursorEntity).findOne({ where: { id: 1 } });
    expect(row?.checkpointVersion).toBe(CURSOR_CHECKPOINT_VERSION);
    const savedAt = row?.savedAt instanceof Date ? row.savedAt : new Date(row!.savedAt);
    expect(savedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(savedAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
  });
});
