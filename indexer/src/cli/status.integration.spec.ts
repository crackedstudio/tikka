/**
 * status.integration.spec.ts
 *
 * Integration test for the status CLI command against a real seeded DB instance.
 * Verifies that the StatusResult shape matches operator runbook expectations after
 * DB refactors or query changes.
 *
 * ## What's tested
 * - StatusResult shape: all top-level keys, nested objects, and array fields
 * - Key field presence: current_ledger, lag_ledgers, checkpoint, queue counts
 * - DB connectivity indicator: db.status, db.pool stats
 * - Warning generation: lag threshold, DLQ depth, dependency failures
 *
 * ## What's NOT tested here
 * - Redis connectivity (mocked — too flaky in CI)
 * - Horizon ledger fetch (mocked — external dependency)
 * - ANSI table formatting (covered in status-display.spec.ts)
 */

import { fetchStatus, StatusResult } from './status.service';
import {
  startDb,
  stopDb,
  DbContainerContext,
  CONTAINER_STARTUP_MS,
} from '../test/integration/helpers/db-container';
import { IndexerCursorEntity } from '../database/entities/indexer-cursor.entity';
import { RaffleEventEntity } from '../database/entities/raffle-event.entity';
import { DeadLetterEventEntity, DlqReason } from '../database/entities/dead-letter-event.entity';
import { LAG_THRESHOLD_DEFAULT } from '../health/health.constants';

// ── Mock ioredis ──────────────────────────────────────────────────────────────
const mockRedisInstance = {
  connect: jest.fn().mockResolvedValue(undefined),
  ping: jest.fn().mockResolvedValue('PONG'),
  disconnect: jest.fn().mockReturnValue(undefined),
};

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn(() => mockRedisInstance),
  };
});

// ── Mock global fetch for Horizon ─────────────────────────────────────────────
const mockFetch = jest.fn();
global.fetch = mockFetch as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Points process.env at the Testcontainers DB so fetchStatus() connects to it. */
function setDbEnv(ctx: DbContainerContext): void {
  const o = ctx.dataSource.options as any;
  if (o.url) process.env.DATABASE_URL = o.url;
  process.env.DB_HOST = o.host;
  process.env.DB_PORT = String(o.port);
  process.env.DB_USERNAME = o.username;
  process.env.DB_PASSWORD = o.password;
  process.env.DB_DATABASE = o.database;
}

/** Seeds a minimal cursor, events, and DLQ entries into the test DB. */
async function seedTestData(ctx: DbContainerContext, opts: {
  currentLedger: number;
  eventCount: number;
  dlqCount: number;
  checkpointLedger?: number;
}) {
  const cursorRepo = ctx.dataSource.getRepository(IndexerCursorEntity);
  const eventRepo = ctx.dataSource.getRepository(RaffleEventEntity);
  const dlqRepo = ctx.dataSource.getRepository(DeadLetterEventEntity);

  // Seed cursor (singleton row)
  await cursorRepo.save({
    id: 1,
    lastLedger: opts.currentLedger,
    lastPagingToken: `${opts.currentLedger}-0000`,
    ledgerHashes: [
      { ledger: opts.currentLedger - 1, hash: 'aaa'.repeat(21) + 'a' },
      { ledger: opts.currentLedger, hash: 'bbb'.repeat(21) + 'b' },
    ],
    processedEventCount: opts.eventCount,
    savedAt: new Date('2024-01-15T10:00:00Z'),
    checkpointVersion: 1,
  });

  // Seed events
  const now = new Date();
  for (let i = 0; i < opts.eventCount; i++) {
    await eventRepo.save({
      raffleId: 1,
      eventType: 'RaffleCreated',
      contractAddress: 'CTEST00000000000000000000000000000000000000000000000000000000',
      schemaVersion: 1,
      ledger: opts.checkpointLedger ?? opts.currentLedger,
      txHash: `tx_${i.toString().padStart(56, '0')}`,
      payloadJson: { raffleId: 1, creator: 'GTEST' },
      indexedAt: new Date(now.getTime() - (opts.eventCount - i) * 1000),
    });
  }

  // Seed DLQ entries
  for (let i = 0; i < opts.dlqCount; i++) {
    await dlqRepo.save({
      ledger: opts.currentLedger,
      contractId: 'CTEST00000000000000000000000000000000000000000000000000000000',
      eventType: 'UnknownEvent',
      rawPayload: { error: 'test' },
      errorMessage: `DLQ test error ${i}`,
      reason: DlqReason.HANDLER_ERROR,
      retryable: true,
      retryCount: 0,
      attemptCount: 1,
      replayedAt: null,
    });
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('status CLI integration', () => {
  let ctx: DbContainerContext;
  let savedEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    ctx = await startDb();
  }, CONTAINER_STARTUP_MS);

  afterAll(async () => {
    await stopDb(ctx);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    savedEnv = { ...process.env };

    // Default: Redis healthy, Horizon returns a ledger 2 ahead
    mockRedisInstance.connect.mockResolvedValue(undefined);
    mockRedisInstance.ping.mockResolvedValue('PONG');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        _embedded: { records: [{ sequence: '1002' }] },
      }),
    });
  });

  afterEach(async () => {
    // Restore env and clean seeded rows between tests
    process.env = savedEnv;
    await ctx.dataSource.getRepository(IndexerCursorEntity).clear();
    await ctx.dataSource.getRepository(RaffleEventEntity).clear();
    await ctx.dataSource.getRepository(DeadLetterEventEntity).clear();
  });

  // ── Shape validation ────────────────────────────────────────────────────────

  it('returns the expected StatusResult shape with all top-level keys', async () => {
    await seedTestData(ctx, { currentLedger: 1000, eventCount: 10, dlqCount: 0 });
    setDbEnv(ctx);

    const result = await fetchStatus();

    // ── Top-level shape ──
    expect(result).toHaveProperty('timestamp');
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    expect(result).toHaveProperty('indexer');
    expect(result).toHaveProperty('events');
    expect(result).toHaveProperty('dlq');
    expect(result).toHaveProperty('cache');
    expect(result).toHaveProperty('db');
    expect(result).toHaveProperty('warnings');

    // ── Indexer section ──
    expect(result.indexer).toHaveProperty('current_ledger');
    expect(result.indexer.current_ledger).toBe(1000);

    expect(result.indexer).toHaveProperty('horizon_ledger');
    expect(result.indexer.horizon_ledger).toBe(1002);

    expect(result.indexer).toHaveProperty('lag_ledgers');
    expect(result.indexer.lag_ledgers).toBe(2);

    expect(result.indexer).toHaveProperty('mode');
    expect(result.indexer.mode).toBeNull(); // CLI cannot infer runtime mode

    expect(result.indexer).toHaveProperty('checkpoint');
    expect(result.indexer.checkpoint).not.toBeNull();
    expect(result.indexer.checkpoint!.sequence).toBe(1000);
    expect(result.indexer.checkpoint!.ledger_hash).toBe('bbb'.repeat(21) + 'b');
    expect(result.indexer.checkpoint!.processed_event_count).toBe(10);
    expect(result.indexer.checkpoint!.saved_at).toBe('2024-01-15T10:00:00.000Z');
    expect(result.indexer.checkpoint!.version).toBe(1);

    // ── Events section ──
    expect(result.events).toHaveProperty('total_processed');
    expect(result.events.total_processed).toBe(10);

    expect(result.events).toHaveProperty('last_24h');
    expect(result.events.last_24h).toBeGreaterThanOrEqual(0);

    expect(result.events).toHaveProperty('last_processed_at');
    expect(result.events.last_processed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // ── DLQ section ──
    expect(result.dlq).toHaveProperty('total');
    expect(result.dlq.total).toBe(0);

    // ── Cache section ──
    expect(result.cache).toHaveProperty('status');
    expect(result.cache.status).toBe('ok');
    expect(result.cache).toHaveProperty('latency_ms');
    expect(result.cache.latency_ms).toBeGreaterThanOrEqual(0);

    // ── DB section ──
    expect(result.db).toHaveProperty('status');
    expect(result.db.status).toBe('ok');
    expect(result.db).toHaveProperty('pool');
    expect(result.db.pool).not.toBeNull();
    expect(result.db.pool!).toHaveProperty('total');
    expect(result.db.pool!).toHaveProperty('idle');
    expect(result.db.pool!).toHaveProperty('waiting');

    // ── Warnings ──
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(result.warnings).toHaveLength(0); // healthy state
  });

  // ── Checkpoint integrity ────────────────────────────────────────────────────

  it('returns null checkpoint when cursor row does not exist', async () => {
    // No seed — empty DB
    setDbEnv(ctx);

    const result = await fetchStatus();

    expect(result.indexer.current_ledger).toBe(0);
    expect(result.indexer.checkpoint).toBeNull();
  });

  it('returns checkpoint details when cursor is populated', async () => {
    await seedTestData(ctx, { currentLedger: 500, eventCount: 42, dlqCount: 0 });
    setDbEnv(ctx);

    const result = await fetchStatus();

    expect(result.indexer.checkpoint).not.toBeNull();
    expect(result.indexer.checkpoint!.sequence).toBe(500);
    expect(result.indexer.checkpoint!.processed_event_count).toBe(42);
    expect(result.indexer.checkpoint!.version).toBe(1);
  });

  // ── Warning generation ──────────────────────────────────────────────────────

  it('generates a lag warning when indexer is far behind Horizon', async () => {
    await seedTestData(ctx, { currentLedger: 100, eventCount: 5, dlqCount: 0 });

    // Mock Horizon returning a ledger way ahead
    const highLag = 100 + LAG_THRESHOLD_DEFAULT + 50;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        _embedded: { records: [{ sequence: String(highLag) }] },
      }),
    });

    setDbEnv(ctx);
    const result = await fetchStatus();

    expect(result.indexer.lag_ledgers).toBe(LAG_THRESHOLD_DEFAULT + 50);
    expect(result.warnings).toContain(
      `Indexer lag is high (> ${LAG_THRESHOLD_DEFAULT} ledgers).`,
    );
  });

  it('generates a DLQ warning when dead-letter queue has items', async () => {
    await seedTestData(ctx, { currentLedger: 1000, eventCount: 10, dlqCount: 3 });
    setDbEnv(ctx);

    const result = await fetchStatus();

    expect(result.dlq.total).toBe(3);
    expect(result.warnings).toContain(
      `Dead-letter queue contains 3 events. Run 'pnpm run dlq:replay' to retry.`,
    );
  });

  it('generates DB and cache warnings when dependencies fail', async () => {
    // Mock Redis failure
    mockRedisInstance.connect.mockRejectedValueOnce(new Error('Redis unreachable'));

    // Provide an invalid DB config so fetchStatus() gets a connection error
    process.env.DATABASE_URL = 'postgresql://bad:bad@localhost:9999/nonexistent';
    delete process.env.DB_HOST;

    const result = await fetchStatus();

    expect(result.db.status).toBe('error');
    expect(result.cache.status).toBe('error');

    expect(result.warnings).toContain(
      'Database is unreachable. Check connection string and DB service.',
    );
    expect(result.warnings).toContain(
      'Redis cache is unreachable. Check REDIS_HOST and REDIS_PORT.',
    );
  });

  // ── Last 24h event count ────────────────────────────────────────────────────

  it('counts events indexed in the last 24 hours', async () => {
    await seedTestData(ctx, { currentLedger: 1000, eventCount: 20, dlqCount: 0 });
    setDbEnv(ctx);

    const result = await fetchStatus();

    expect(result.events.last_24h).toBeGreaterThanOrEqual(0);
    expect(result.events.last_24h).toBeLessThanOrEqual(result.events.total_processed);
  });

  // ── JSON serialization stability ────────────────────────────────────────────

  it('produces a StatusResult that round-trips cleanly through JSON.stringify', async () => {
    await seedTestData(ctx, { currentLedger: 1000, eventCount: 10, dlqCount: 1 });
    setDbEnv(ctx);

    const result = await fetchStatus();

    // Should not throw
    const json = JSON.stringify(result);
    const parsed: StatusResult = JSON.parse(json);

    // Spot-check a few fields to ensure no corruption
    expect(parsed.indexer.current_ledger).toBe(result.indexer.current_ledger);
    expect(parsed.dlq.total).toBe(result.dlq.total);
    expect(parsed.warnings).toEqual(result.warnings);
  });
});
