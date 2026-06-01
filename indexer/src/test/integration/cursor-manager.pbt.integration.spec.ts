/**
 * cursor-manager.pbt.integration.spec.ts
 *
 * Property-based tests for CursorManagerService using fast-check.
 *
 * Properties covered:
 *   1. Save-then-read round trip  — getCursor returns what was saved
 *   2. Sequence regression        — saveCursor throws on backward sequence
 *   3. Rollback atomicity         — rolled-back save leaves cursor unchanged
 *   4. Monotonic advance          — after saving increasing ledgers, getCursor returns the last
 *   5. Event count monotonicity   — decreasing processedEventCount throws
 */

import * as fc from 'fast-check';
import { DataSource } from 'typeorm';
import { IndexerCursorEntity } from '../../database/entities/indexer-cursor.entity';
import { CursorManagerService, CursorIntegrityError } from '../../ingestor/cursor-manager.service';
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
  // Reset in-memory state between runs
  const repo = dataSource.getRepository(IndexerCursorEntity);
  cursorManager = new CursorManagerService(repo);
});

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('CursorManagerService — property-based tests', () => {
  it(
    'Property 1: save-then-read round trip — getCursor returns the saved ledger and token',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1 }),
          fc.string(),
          async (ledger, token) => {
            await dataSource.query(`TRUNCATE TABLE indexer_cursor RESTART IDENTITY`);
            const repo = dataSource.getRepository(IndexerCursorEntity);
            const cm = new CursorManagerService(repo);
            await cm.saveCursor(ledger, 'hash-' + ledger, token, 0);
            const result = await cm.getCursor();
            return result?.lastLedger === ledger && result?.lastPagingToken === token;
          },
        ),
        { numRuns: 50 },
      );
    },
  );

  it(
    'Property 2: sequence regression — saveCursor throws CursorIntegrityError when sequence goes backward',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 1_000_000 }),
          async (higher) => {
            await dataSource.query(`TRUNCATE TABLE indexer_cursor RESTART IDENTITY`);
            const repo = dataSource.getRepository(IndexerCursorEntity);
            const cm = new CursorManagerService(repo);
            await cm.saveCursor(higher, 'hash-a', 'tok-a', 0);
            const lower = higher - 1;
            let threw = false;
            try {
              await cm.saveCursor(lower, 'hash-b', 'tok-b', 0);
            } catch (e) {
              threw = e instanceof CursorIntegrityError;
            }
            return threw;
          },
        ),
        { numRuns: 50 },
      );
    },
  );

  it(
    'Property 3: rollback atomicity — rolled-back saveCursor leaves cursor unchanged',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 500_000 }),
          fc.string(),
          fc.integer({ min: 1, max: 500_000 }),
          fc.string(),
          async (n0, t0, delta, t1) => {
            const n1 = n0 + delta + 1; // always strictly greater
            await dataSource.query(`TRUNCATE TABLE indexer_cursor RESTART IDENTITY`);
            const repo = dataSource.getRepository(IndexerCursorEntity);
            const cm = new CursorManagerService(repo);
            await cm.saveCursor(n0, 'hash-0', t0, 0);
            const qr = dataSource.createQueryRunner();
            await qr.connect();
            await qr.startTransaction();
            await cm.saveCursor(n1, 'hash-1', t1, 1, qr);
            await qr.rollbackTransaction();
            await qr.release();
            // Reset in-memory lastCheckpoint to n0 state so getCursor re-validates correctly
            const cm2 = new CursorManagerService(repo);
            const result = await cm2.getCursor();
            return result?.lastLedger === n0 && result?.lastPagingToken === t0;
          },
        ),
        { numRuns: 50 },
      );
    },
  );

  it(
    'Property 4: monotonic advance — after saving strictly increasing ledgers, getCursor returns the last',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .array(fc.integer({ min: 1, max: 1_000_000 }), { minLength: 2, maxLength: 10 })
            .map((arr) => [...new Set(arr)].sort((a, b) => a - b)),
          async (ledgers) => {
            await dataSource.query(`TRUNCATE TABLE indexer_cursor RESTART IDENTITY`);
            const repo = dataSource.getRepository(IndexerCursorEntity);
            const cm = new CursorManagerService(repo);
            let count = 0;
            for (const l of ledgers) {
              await cm.saveCursor(l, `hash-${l}`, `token-${l}`, count++);
            }
            const result = await cm.getCursor();
            return result?.lastLedger === ledgers[ledgers.length - 1];
          },
        ),
        { numRuns: 50 },
      );
    },
  );

  it(
    'Property 5: event count regression — saveCursor throws when processedEventCount decreases',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 500_000 }),
          fc.integer({ min: 1, max: 1000 }),
          async (ledger, count) => {
            await dataSource.query(`TRUNCATE TABLE indexer_cursor RESTART IDENTITY`);
            const repo = dataSource.getRepository(IndexerCursorEntity);
            const cm = new CursorManagerService(repo);
            await cm.saveCursor(ledger, 'hash-a', 'tok-a', count);
            let threw = false;
            try {
              await cm.saveCursor(ledger + 1, 'hash-b', 'tok-b', count - 1);
            } catch (e) {
              threw = e instanceof CursorIntegrityError;
            }
            return threw;
          },
        ),
        { numRuns: 50 },
      );
    },
  );
});
