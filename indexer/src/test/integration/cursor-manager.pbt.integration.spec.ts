/**
 * cursor-manager.pbt.integration.spec.ts
 *
 * Property-based tests for CursorManagerService using fast-check.
 *
 * Properties covered:
 *   1. Save-then-read round trip       (Validates: Requirements 1.1, 1.3, 2.1, 6.1)
 *   2. Idempotent write                (Validates: Requirements 2.4, 6.2)
 *   3. Rollback atomicity              (Validates: Requirements 3.3, 6.3)
 *   6. Monotonic advance               (Validates: Requirements 6.5)
 */

import * as fc from 'fast-check';
import { DataSource } from 'typeorm';
import { IndexerCursorEntity } from '../../database/entities/indexer-cursor.entity';
import { CursorManagerService } from '../../ingestor/cursor-manager.service';
import {
  startDb,
  stopDb,
  DbContainerContext,
  CONTAINER_STARTUP_MS,
} from './helpers/db-container';

// ─── Lifecycle ────────────────────────────────────────────────────────────────

let ctx: DbContainerContext;
let cursorManager: CursorManagerService;
let dataSource: DataSource;

beforeAll(async () => {
  ctx = await startDb();
  dataSource = ctx.dataSource;
  const repo = dataSource.getRepository(IndexerCursorEntity);
  cursorManager = new CursorManagerService(repo);
}, CONTAINER_STARTUP_MS);

afterAll(async () => stopDb(ctx));

beforeEach(async () => {
  await dataSource.query(`TRUNCATE TABLE indexer_cursor RESTART IDENTITY`);
});

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('CursorManagerService — property-based tests', () => {
  it(
    // Feature: cursor-manager, Property 1: save-then-read round trip
    'Property 1: save-then-read round trip — for any (ledger > 0, token), getCursor returns the saved values',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1 }),
          fc.string(),
          async (ledger, token) => {
            await dataSource.query(`TRUNCATE TABLE indexer_cursor RESTART IDENTITY`);
            await cursorManager.saveCursor(ledger, token);
            const result = await cursorManager.getCursor();
            return result?.lastLedger === ledger && result?.lastPagingToken === token;
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    // Feature: cursor-manager, Property 2: idempotent write
    'Property 2: idempotent write — calling saveCursor twice yields the same state as once',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1 }),
          fc.string(),
          async (ledger, token) => {
            await dataSource.query(`TRUNCATE TABLE indexer_cursor RESTART IDENTITY`);
            await cursorManager.saveCursor(ledger, token);
            await cursorManager.saveCursor(ledger, token);
            const result = await cursorManager.getCursor();
            return result?.lastLedger === ledger && result?.lastPagingToken === token;
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    // Feature: cursor-manager, Property 3: rollback atomicity
    'Property 3: rollback atomicity — rolled-back saveCursor leaves cursor unchanged',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1 }),
          fc.string(),
          fc.integer({ min: 2 }),
          fc.string(),
          async (n0, t0, n1, t1) => {
            await dataSource.query(`TRUNCATE TABLE indexer_cursor RESTART IDENTITY`);
            await cursorManager.saveCursor(n0, t0);
            const qr = dataSource.createQueryRunner();
            await qr.connect();
            await qr.startTransaction();
            await cursorManager.saveCursor(n1, t1, qr);
            await qr.rollbackTransaction();
            await qr.release();
            const result = await cursorManager.getCursor();
            return result?.lastLedger === n0 && result?.lastPagingToken === t0;
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    // Feature: cursor-manager, Property 6: monotonic advance
    'Property 6: monotonic advance — after saving increasing ledgers, getCursor returns the last',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .array(fc.integer({ min: 1, max: 1_000_000 }), { minLength: 2 })
            .map((arr) => [...new Set(arr)].sort((a, b) => a - b)),
          async (ledgers) => {
            await dataSource.query(`TRUNCATE TABLE indexer_cursor RESTART IDENTITY`);
            for (const l of ledgers) await cursorManager.saveCursor(l, `token-${l}`);
            const result = await cursorManager.getCursor();
            const last = ledgers[ledgers.length - 1];
            return result?.lastLedger === last;
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
