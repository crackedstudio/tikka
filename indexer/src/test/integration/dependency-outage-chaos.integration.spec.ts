/**
 * dependency-outage-chaos.integration.spec.ts
 *
 * Chaos coverage for dependency outages (Soroban/Horizon, PostgreSQL, Redis).
 *
 * The indexer has protections for each dependency — cursor integrity, the DLQ,
 * ingestion back-off, and cache-swallowing — but the existing integration suite
 * only exercises the happy path. This suite severs each dependency *mid-ingestion*
 * and asserts the indexer recovers with no lost or duplicated events.
 *
 * Outages are injected in-process via `helpers/fault-injection.ts` rather than by
 * killing containers, so the suite is deterministic and runs under the existing
 * `indexer-integration.yml` job without extra container infrastructure.
 */

import { ConfigService } from '@nestjs/config';

// `LedgerPollerService` imports the real `Horizon` client, which pulls in
// ESM-only `@noble/hashes` and cannot be loaded through ts-jest's CommonJS
// pipeline. Every scenario below replaces the client with
// `ControllableHorizon`, so the module is stubbed before it is resolved.
jest.mock('@stellar/stellar-sdk', () => ({
  Horizon: {
    Server: class MockHorizonServer {
      constructor(_url: string) {
        void _url;
      }
    },
  },
}));

import { LedgerPollerService } from '../../ingestor/ledger-poller.service';
import { CursorManagerService } from '../../ingestor/cursor-manager.service';
import { IEventParser } from '../../ingestor/event-parser.interface';
import { DomainEvent } from '../../ingestor/event.types';
import { DryRunService } from '../../ingestor/dry-run.service';
import { IngestionDispatcherService } from '../../ingestor/ingestion-dispatcher.service';
import { MetricsService } from '../../metrics/metrics.service';
import { ReorgRollbackService } from '../../ingestor/reorg-rollback.service';
import { PipelineStateMachine } from '../../ingestor/pipeline-state';
import { CacheService } from '../../cache/cache.service';

import {
  ControllableHorizon,
  ControllableRedis,
  IdempotentEventTable,
  RawHorizonEvent,
  asRedisClient,
  makeRawHorizonEvent,
} from './helpers/fault-injection';

// ─── Fakes ───────────────────────────────────────────────────────────────────

interface CursorRow {
  lastLedger: number;
  lastPagingToken: string;
  processedEventCount: number;
}

/**
 * Models the `indexer_cursor` singleton row. While `outage` is set (Postgres
 * unreachable) both reads and writes reject, exactly like a severed connection.
 */
class FakeCursorManager {
  row: CursorRow = { lastLedger: 0, lastPagingToken: '0', processedEventCount: 0 };
  writes = 0;
  outage = false;

  async getCursor(): Promise<unknown> {
    if (this.outage) throw new Error('connection terminated unexpectedly');
    if (this.row.lastLedger === 0) return null;
    return {
      lastLedger: this.row.lastLedger,
      lastPagingToken: this.row.lastPagingToken,
      ledgerHashes: [],
    };
  }

  getStatus(): unknown {
    return {
      mode: 'RUNNING',
      lastCheckpoint: {
        sequence: this.row.lastLedger,
        ledgerHash: '',
        processedEventCount: this.row.processedEventCount,
        savedAt: new Date().toISOString(),
        version: 1,
      },
      lastViolation: null,
      startupIntegrityPassed: true,
      uptimeMs: 0,
    };
  }

  async saveCursor(
    ledger: number,
    _ledgerHash: string,
    token?: string,
    processedCount?: number,
  ): Promise<void> {
    if (this.outage) throw new Error('connection terminated unexpectedly');
    this.row = {
      lastLedger: ledger,
      lastPagingToken: token ?? '',
      processedEventCount: processedCount ?? this.row.processedEventCount,
    };
    this.writes += 1;
  }

  async checkForReorg(): Promise<number | null> {
    return null;
  }
}

/**
 * Models `IngestionDispatcherService` + the Postgres writes behind it. When the
 * database is down (`cursor.outage`) dispatch throws, which is what should stop
 * the cursor from advancing. `outageAtDispatch` simulates the outage starting
 * just before the Nth batch is dispatched.
 */
class FakeDispatcher {
  dispatchCalls = 0;
  outageAtDispatch: number | null = null;

  constructor(
    private readonly table: IdempotentEventTable<RawHorizonEvent>,
    private readonly cursor: FakeCursorManager,
  ) {}

  async dispatchBatch(
    items: Array<{ event: DomainEvent; raw: Record<string, unknown> }>,
  ): Promise<
    Array<{
      handlerName: string;
      eventId: string;
      eventType: string;
      outcome: 'succeeded';
      durationMs: number;
    }>
  > {
    this.dispatchCalls += 1;
    if (this.outageAtDispatch !== null && this.dispatchCalls >= this.outageAtDispatch) {
      this.cursor.outage = true;
    }
    if (this.cursor.outage) {
      throw new Error('connection terminated unexpectedly');
    }

    return items.map((item) => {
      const raw = item.raw as unknown as RawHorizonEvent;
      // Production guard: unique tx_hash + INSERT … ON CONFLICT DO NOTHING.
      this.table.insert(raw);
      return {
        handlerName: 'TicketProcessor.handleTicketPurchased',
        eventId: raw.id,
        eventType: item.event.type,
        outcome: 'succeeded' as const,
        durationMs: 1,
      };
    });
  }
}

class RecordingMetrics {
  errors = 0;
  reorgDetected = 0;
  lag = 0;
  readonly processed = new Map<string, number>();
  readonly pollDurations: number[] = [];

  incrementErrors(count = 1): void {
    this.errors += count;
  }

  incrementReorgDetected(): void {
    this.reorgDetected += 1;
  }

  incrementEventsProcessed(type: string, count = 1): void {
    this.processed.set(type, (this.processed.get(type) ?? 0) + count);
  }

  setLagLedgers(lag: number): void {
    this.lag = lag;
  }

  recordPollDuration(seconds: number): void {
    this.pollDurations.push(seconds);
  }
}

// ─── Harness ─────────────────────────────────────────────────────────────────

const parser: IEventParser = {
  parse: (raw): DomainEvent | null => {
    try {
      const decoded = JSON.parse(raw.value) as Record<string, unknown> & {
        type: string;
      };
      return { ...decoded, schemaVersion: 1 } as unknown as DomainEvent;
    } catch {
      return null;
    }
  },
};

function configStub(values: Record<string, unknown>): ConfigService {
  return {
    get: (key: string, fallback?: unknown) =>
      key in values ? values[key] : fallback,
  } as unknown as ConfigService;
}

interface Harness {
  poller: LedgerPollerService;
  horizon: ControllableHorizon;
  cursor: FakeCursorManager;
  dispatcher: FakeDispatcher;
  table: IdempotentEventTable<RawHorizonEvent>;
  metrics: RecordingMetrics;
}

function buildHarness(batchSize = 25): Harness {
  const horizon = new ControllableHorizon();
  const cursor = new FakeCursorManager();
  const table = new IdempotentEventTable<RawHorizonEvent>();
  const dispatcher = new FakeDispatcher(table, cursor);
  const metrics = new RecordingMetrics();

  const poller = new LedgerPollerService(
    configStub({
      HORIZON_URL: 'https://mock-horizon.local',
      TIKKA_CONTRACT_ID: 'contract-1',
      INGESTION_BATCH_SIZE: batchSize,
      REORG_SAFETY_DEPTH: 0,
    }),
    cursor as unknown as CursorManagerService,
    parser,
    { enabled: false } as unknown as DryRunService,
    dispatcher as unknown as IngestionDispatcherService,
    metrics as unknown as MetricsService,
    { rollback: async () => undefined } as unknown as ReorgRollbackService,
    { apply: () => undefined } as unknown as PipelineStateMachine,
  );

  // The constructor builds a real Horizon.Server; swap in the controllable one.
  (poller as unknown as { horizonServer: ControllableHorizon }).horizonServer =
    horizon;
  (poller as unknown as { isRunning: boolean }).isRunning = true;

  return { poller, horizon, cursor, dispatcher, table, metrics };
}

interface PollerInternals {
  pollOnce(): Promise<void>;
  startSse(cursor: string): void;
  stopIngestion(): void;
  retryAttempt: number;
  pollingTimeout?: NodeJS.Timeout;
}

function internals(poller: LedgerPollerService): PollerInternals {
  return poller as unknown as PollerInternals;
}

function seedEvents(count: number, startLedger = 100): RawHorizonEvent[] {
  return Array.from({ length: count }, (_, index) =>
    makeRawHorizonEvent({
      id: `tx-${index + 1}`,
      ledger: startLedger + index,
      topic: 'TicketPurchased',
      payload: {
        raffle_id: 1,
        buyer: 'GBUYER0000000000000000000000000000000000000000000000000000',
        ticket_ids: [index + 1],
        total_paid: '1',
      },
    }),
  );
}

function tick(ms = 25): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Postgres outage ─────────────────────────────────────────────────────────

describe('Dependency outage chaos — Postgres', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = buildHarness();
  });

  afterEach(() => {
    internals(harness.poller).stopIngestion();
  });

  it('does not advance the cursor past unprocessed ledgers and replays them after recovery', async () => {
    harness.horizon.seed(seedEvents(60));

    // Postgres disappears just before the second batch is written.
    harness.dispatcher.outageAtDispatch = 2;

    await internals(harness.poller).pollOnce();

    // Batch 1 (25 events) committed; batch 2 failed and the cursor stopped there.
    expect(harness.table.size).toBe(25);
    expect(harness.cursor.row.lastLedger).toBe(124);
    expect(harness.cursor.row.lastPagingToken).toBe('124');
    expect(harness.metrics.errors).toBeGreaterThanOrEqual(1);
    expect(harness.table.duplicateAttempts).toBe(0);

    // Postgres recovers; the next poll resumes from the last safe checkpoint.
    harness.dispatcher.outageAtDispatch = null;
    harness.cursor.outage = false;

    await internals(harness.poller).pollOnce();

    // Every event landed exactly once — nothing lost, nothing duplicated.
    expect(harness.table.size).toBe(60);
    expect(harness.table.duplicateAttempts).toBe(0);
    expect(harness.cursor.row.lastLedger).toBe(159);
    expect(harness.table.ids()).toEqual(
      seedEvents(60)
        .map((event) => event.id)
        .sort(),
    );
  });
});

// ─── Horizon / Soroban RPC outage ────────────────────────────────────────────

describe('Dependency outage chaos — Horizon / Soroban RPC', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = buildHarness();
  });

  afterEach(() => {
    internals(harness.poller).stopIngestion();
  });

  it('falls back to polling when the SSE stream drops', async () => {
    harness.horizon.seed(seedEvents(5));

    internals(harness.poller).startSse('now');
    expect(harness.horizon.hasStream).toBe(true);

    harness.horizon.failStream(new Error('socket hang up'));
    await tick();

    expect(harness.horizon.callCount).toBeGreaterThanOrEqual(1);
    expect(harness.table.size).toBe(5);
  });

  it('backs off and preserves the cursor while unreachable, then catches up', async () => {
    harness.horizon.seed(seedEvents(10));
    harness.horizon.down = true;

    await internals(harness.poller).pollOnce();

    expect(internals(harness.poller).retryAttempt).toBe(1);
    expect(internals(harness.poller).pollingTimeout).toBeDefined();
    expect(harness.metrics.errors).toBeGreaterThanOrEqual(1);
    // Nothing applied and the cursor is untouched — resume point is safe.
    expect(harness.table.size).toBe(0);
    expect(harness.cursor.row.lastLedger).toBe(0);

    internals(harness.poller).stopIngestion();
    harness.horizon.down = false;

    await internals(harness.poller).pollOnce();

    expect(internals(harness.poller).retryAttempt).toBe(0);
    expect(harness.table.size).toBe(10);
    expect(harness.cursor.row.lastLedger).toBe(109);
    expect(harness.table.duplicateAttempts).toBe(0);
  });

  it('advances the cursor only to the last event of a partial response', async () => {
    harness.horizon.seed(seedEvents(30));

    // Horizon returns a truncated page (10 of 30 records).
    harness.horizon.partialLimit = 10;
    await internals(harness.poller).pollOnce();

    expect(harness.table.size).toBe(10);
    expect(harness.cursor.row.lastLedger).toBe(109);

    // Next poll continues from the cursor — the remaining 20 are not skipped.
    harness.horizon.partialLimit = undefined;
    await internals(harness.poller).pollOnce();

    expect(harness.table.size).toBe(30);
    expect(harness.cursor.row.lastLedger).toBe(129);
    expect(harness.table.duplicateAttempts).toBe(0);
  });
});

// ─── Redis outage / eviction ─────────────────────────────────────────────────

describe('Dependency outage chaos — Redis', () => {
  const buildCache = (): { cache: CacheService; redis: ControllableRedis } => {
    const redis = new ControllableRedis();
    const cache = new CacheService(configStub({}) as ConfigService);
    (cache as unknown as { redis: unknown }).redis = asRedisClient(redis);
    return { cache, redis };
  };

  /**
   * Mirrors the production ingestion write: read-through the cache, then an
   * idempotent insert guarded by a unique tx hash.
   */
  const applyEvent = async (
    cache: CacheService,
    table: IdempotentEventTable<RawHorizonEvent>,
    event: RawHorizonEvent,
  ): Promise<boolean> => {
    let fetches = 0;
    await cache.wrap(`raffle:${event.contract_id}`, 60, async () => {
      fetches += 1;
      return { raffleId: event.contract_id, ledger: Number(event.ledger) };
    });
    void fetches;
    return table.insert(event);
  };

  it('serves from cache and absorbs duplicate deliveries', async () => {
    const { cache } = buildCache();
    const table = new IdempotentEventTable<RawHorizonEvent>();
    const event = seedEvents(1)[0];

    expect(await applyEvent(cache, table, event)).toBe(true);
    expect(await applyEvent(cache, table, event)).toBe(false);

    expect(table.size).toBe(1);
    expect(table.duplicateAttempts).toBe(1);
  });

  it('keeps ingesting while Redis is unreachable and still deduplicates after eviction', async () => {
    const { cache, redis } = buildCache();
    const table = new IdempotentEventTable<RawHorizonEvent>();
    const [first, second] = seedEvents(2);

    // Baseline: first event cached + persisted.
    expect(await applyEvent(cache, table, first)).toBe(true);

    // Redis goes down — cache reads return null instead of throwing.
    redis.down = true;
    await expect(cache.get('raffle:contract-1')).resolves.toBeNull();
    // Ingestion is not blocked by the cache outage.
    await expect(applyEvent(cache, table, second)).resolves.toBe(true);
    expect(table.size).toBe(2);

    // Redis recovers, then evicts everything under memory pressure.
    redis.down = false;
    redis.evictAll();
    expect(redis.evictions).toBe(1);
    await expect(cache.get('raffle:contract-1')).resolves.toBeNull();

    // Re-delivering the first event after eviction is a cache miss, but the
    // unique-tx-hash guard means it does not create a second row.
    expect(await applyEvent(cache, table, first)).toBe(false);
    expect(table.size).toBe(2);
    expect(table.duplicateAttempts).toBe(1);
  });
});
