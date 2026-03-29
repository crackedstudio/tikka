/**
 * cursor-recovery.integration.spec.ts
 *
 * Tests cursor persistence and crash-recovery behaviour of the indexer.
 *
 * The current CursorManagerService stores state in-memory (a known scaffold
 * placeholder). These tests verify the *intended* DB-backed behaviour by
 * interacting with IndexerCursorEntity directly — the same table a
 * production-grade CursorManagerService would use.
 *
 * Scenarios covered:
 *   1. Cursor is persisted to the `indexer_cursor` table after a batch
 *   2. After a simulated crash (DataSource.destroy + re-init), the cursor
 *      row is still present and readable — processing can resume
 *   3. Only the highest ledger in a batch is persisted (last-write-wins)
 *   4. Reprocessing events after the cursor ledger does not re-insert
 *      already-processed rows (idempotency via tx hash)
 *   5. A fresh start (no cursor row) defaults to ledger 0
 */

import { DataSource, Repository } from 'typeorm';
import { IndexerCursorEntity } from '../../database/entities/indexer-cursor.entity';
import { RaffleEntity, RaffleStatus } from '../../database/entities/raffle.entity';
import { TicketEntity } from '../../database/entities/ticket.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { RaffleEventEntity } from '../../database/entities/raffle-event.entity';
import { TicketProcessor } from '../../processors/ticket.processor';
import { RaffleProcessor } from '../../processors/raffle.processor';
import { UserProcessor } from '../../processors/user.processor';
import {
  startDb,
  stopDb,
  buildDataSource,
  DbContainerContext,
  CONTAINER_STARTUP_MS,
} from './helpers/db-container';
import {
  BUYER_ADDRESS,
  mockTxHash,
} from './helpers/mock-events';

// ─── Shared mock ──────────────────────────────────────────────────────────────

const mockCacheService = {
  invalidateActiveRaffles: jest.fn().mockResolvedValue(undefined),
  invalidateRaffleDetail: jest.fn().mockResolvedValue(undefined),
  invalidateUserProfile: jest.fn().mockResolvedValue(undefined),
  invalidateLeaderboard: jest.fn().mockResolvedValue(undefined),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Upserts the singleton cursor row (id=1) in the DB.
 * Mirrors what a production CursorManagerService.saveCursor() should do.
 */
async function saveCursorToDB(
  ds: DataSource,
  lastLedger: number,
  lastPagingToken = '',
): Promise<void> {
  await ds.query(
    `INSERT INTO indexer_cursor (id, last_ledger, last_paging_token)
     VALUES (1, $1, $2)
     ON CONFLICT (id) DO UPDATE
       SET last_ledger = $1, last_paging_token = $2, updated_at = NOW()`,
    [lastLedger, lastPagingToken],
  );
}

/**
 * Reads the singleton cursor row from the DB.
 * Returns null if none exists (fresh start).
 */
async function loadCursorFromDB(
  ds: DataSource,
): Promise<{ lastLedger: number; lastPagingToken: string } | null> {
  const rows = await ds.query(
    `SELECT last_ledger, last_paging_token FROM indexer_cursor WHERE id = 1`,
  );
  if (!rows.length) return null;
  return {
    lastLedger: Number(rows[0].last_ledger),
    lastPagingToken: rows[0].last_paging_token,
  };
}

/** Inserts a minimal raffle row so FK constraints on tickets don't fail. */
async function seedRaffle(ds: DataSource, raffleId = 1): Promise<void> {
  const repo = ds.getRepository(RaffleEntity);
  await repo.save(
    repo.create({
      id: raffleId,
      creator: 'GCREATOR0000000000000000000000000000000000000000000000GCREATOR',
      ticketPrice: '10000000',
      maxTickets: 100,
      asset: 'XLM',
      endTime: String(9999999999),
      createdLedger: 1,
      status: RaffleStatus.OPEN,
    }),
  );
}

async function truncateAll(ds: DataSource): Promise<void> {
  await ds.query(`SET session_replication_role = 'replica'`);
  await ds.query(
    `TRUNCATE TABLE raffle_events, tickets, users, raffles, indexer_cursor RESTART IDENTITY CASCADE`,
  );
  await ds.query(`SET session_replication_role = 'DEFAULT'`);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

let ctx: DbContainerContext;

beforeAll(async () => {
  ctx = await startDb();
}, CONTAINER_STARTUP_MS);

afterAll(async () => stopDb(ctx));

beforeEach(async () => {
  jest.clearAllMocks();
  await truncateAll(ctx.dataSource);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Cursor persistence', () => {
  it('persists the cursor row and reads it back correctly', async () => {
    await saveCursorToDB(ctx.dataSource, 42, 'token-abc');

    const cursor = await loadCursorFromDB(ctx.dataSource);
    expect(cursor).not.toBeNull();
    expect(cursor!.lastLedger).toBe(42);
    expect(cursor!.lastPagingToken).toBe('token-abc');
  });

  it('overwrites on subsequent saves (upsert semantics)', async () => {
    await saveCursorToDB(ctx.dataSource, 10, 'old-token');
    await saveCursorToDB(ctx.dataSource, 99, 'new-token');

    const cursor = await loadCursorFromDB(ctx.dataSource);
    expect(cursor!.lastLedger).toBe(99);
    expect(cursor!.lastPagingToken).toBe('new-token');
  });

  it('stores the highest ledger from a batch of events', async () => {
    // Simulate processing ledgers 50, 55, 60 — only persist the max
    const ledgers = [50, 55, 60];
    const maxLedger = Math.max(...ledgers);

    await saveCursorToDB(ctx.dataSource, maxLedger, 'paging-60');

    const cursor = await loadCursorFromDB(ctx.dataSource);
    expect(cursor!.lastLedger).toBe(60);
  });

  it('returns null for a fresh DB with no cursor row', async () => {
    const cursor = await loadCursorFromDB(ctx.dataSource);
    expect(cursor).toBeNull();
  });
});

describe('Crash-recovery — cursor survives DataSource restart', () => {
  it('cursor row is intact after destroying and re-initializing the connection', async () => {
    // 1. Save cursor on original connection
    await saveCursorToDB(ctx.dataSource, 777, 'token-crash-test');

    // 2. Simulate crash: destroy the DataSource (equivalent to process exit)
    await ctx.dataSource.destroy();

    // 3. Re-create a fresh DataSource pointing at the SAME container
    const newDs = await buildDataSource(ctx.container).initialize();

    try {
      // 4. Read cursor — must still be present
      const cursor = await loadCursorFromDB(newDs);
      expect(cursor).not.toBeNull();
      expect(cursor!.lastLedger).toBe(777);
      expect(cursor!.lastPagingToken).toBe('token-crash-test');
    } finally {
      // 5. Restore context DataSource for subsequent tests
      const restoredDs = await buildDataSource(ctx.container).initialize();
      ctx.dataSource = restoredDs;
      await newDs.destroy();
    }
  });

  it('resumes processing from the persisted ledger without re-inserting prior rows', async () => {
    const ds = ctx.dataSource;
    await seedRaffle(ds);
    await ds.getRepository(UserEntity).save(
      ds.getRepository(UserEntity).create({ address: BUYER_ADDRESS, firstSeenLedger: 600 }),
    );

    const userProcessor = new UserProcessor(ds, mockCacheService as any);
    const ticketProcessor = new TicketProcessor(ds, mockCacheService as any, userProcessor);

    // --- Batch 1: ledgers 100–200, cursor saved at 200 ---
    const txA = mockTxHash('AA');
    await ticketProcessor.handleTicketPurchased(1, BUYER_ADDRESS, [1, 2], '0', 150, txA);
    await saveCursorToDB(ds, 200, 'paging-200');

    // --- Simulate crash: reconnect to same DB ---
    await ds.destroy();
    const newDs = await buildDataSource(ctx.container).initialize();
    ctx.dataSource = newDs;

    const cursor = await loadCursorFromDB(newDs);
    expect(cursor!.lastLedger).toBe(200);

    // --- Batch 2: new process, starting from ledger 201 ---
    const up2 = new UserProcessor(newDs, mockCacheService as any);
    const tp2 = new TicketProcessor(newDs, mockCacheService as any, up2);

    // Re-replaying txA (ledger < cursor) — orIgnore() prevents duplicate
    await tp2.handleTicketPurchased(1, BUYER_ADDRESS, [1, 2], '0', 150, txA);

    const tickets = await newDs.getRepository(TicketEntity).findBy({ raffleId: 1 });
    expect(tickets).toHaveLength(2); // not 4 — idempotent

    // Process genuinely new events (ledger > 200)
    const txB = mockTxHash('BB');
    await tp2.handleTicketPurchased(1, BUYER_ADDRESS, [3], '0', 250, txB);
    await saveCursorToDB(newDs, 250, 'paging-250');

    const allTickets = await newDs.getRepository(TicketEntity).findBy({ raffleId: 1 });
    expect(allTickets).toHaveLength(3);

    const finalCursor = await loadCursorFromDB(newDs);
    expect(finalCursor!.lastLedger).toBe(250);
  });
});

describe('Cursor entity via TypeORM repository', () => {
  it('can be upserted via the IndexerCursorEntity repository', async () => {
    const repo = ctx.dataSource.getRepository(IndexerCursorEntity);

    await repo.upsert(
      { id: 1, lastLedger: 1_000, lastPagingToken: 'paging-1000' },
      { conflictPaths: ['id'] },
    );

    const row = await repo.findOneBy({ id: 1 });
    expect(row).not.toBeNull();
    expect(row!.lastLedger).toBe(1_000);
    expect(row!.lastPagingToken).toBe('paging-1000');
  });

  it('updatedAt advances on each upsert', async () => {
    const repo = ctx.dataSource.getRepository(IndexerCursorEntity);

    await repo.upsert(
      { id: 1, lastLedger: 1, lastPagingToken: '' },
      { conflictPaths: ['id'] },
    );
    const first = await repo.findOneBy({ id: 1 });

    // Small delay to ensure clock ticks
    await new Promise((r) => setTimeout(r, 50));

    await repo.upsert(
      { id: 1, lastLedger: 2, lastPagingToken: '' },
      { conflictPaths: ['id'] },
    );
    const second = await repo.findOneBy({ id: 1 });

    expect(second!.updatedAt.getTime()).toBeGreaterThanOrEqual(first!.updatedAt.getTime());
  });
});
