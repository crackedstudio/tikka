/**
 * fault-injection.ts
 *
 * In-process fault-injection primitives for the dependency-outage chaos suite
 * (`dependency-outage-chaos.integration.spec.ts`).
 *
 * The indexer depends on three external systems — Horizon (the Soroban event
 * source), PostgreSQL and Redis. In CI those are real (Testcontainers) for the
 * happy-path suites, but outage scenarios must sever a dependency *mid-ingestion*
 * and then observe recovery. Doing that with containers is slow and flaky, so
 * this harness injects the same failure modes at the dependency seam:
 *
 *  - {@link ControllableHorizon} — a drop-in stand-in for `Horizon.Server` that
 *    can go down, return partial pages, or drop the SSE stream.
 *  - {@link ControllableRedis} — a fake ioredis client that can go down or lose
 *    every key (the eviction-under-memory-pressure case).
 *  - {@link IdempotentEventTable} — models the production idempotency guard
 *    (`INSERT … ON CONFLICT (tx_hash) DO NOTHING` / `.orIgnore()`), so a test
 *    can prove that replay after an outage does not duplicate rows.
 *
 * Everything here is deterministic and needs no Docker, so the chaos suite runs
 * in the same `pnpm run test:integration` job as the container-backed suites.
 */

import Redis from 'ioredis';

/** A raw contract event exactly as Horizon returns it (pre-decode). */
export interface RawHorizonEvent {
  id: string;
  ledger: string;
  paging_token: string;
  contract_id: string;
  type: 'contract';
  ledger_hash?: string;
  value: string;
}

export interface RawHorizonEventInput {
  /** Unique event id — doubles as the tx hash for idempotency. */
  id: string;
  ledger: number;
  /** Contract event topic, e.g. `TicketPurchased`. */
  topic: string;
  /** Extra fields merged into the JSON `value` payload. */
  payload?: Record<string, unknown>;
  contractId?: string;
  ledgerHash?: string;
}

/** Builds a Horizon-shaped raw event whose `value` is JSON the test parser can decode. */
export function makeRawHorizonEvent(input: RawHorizonEventInput): RawHorizonEvent {
  return {
    id: input.id,
    ledger: String(input.ledger),
    paging_token: String(input.ledger),
    contract_id: input.contractId ?? 'contract-1',
    type: 'contract',
    ledger_hash: input.ledgerHash,
    value: JSON.stringify({ type: input.topic, ...(input.payload ?? {}) }),
  };
}

type StreamHandlers = {
  onmessage: (event: unknown) => void;
  onerror: (error: unknown) => void;
};

interface CallResult {
  records: RawHorizonEvent[];
}

interface EventsCursorHandle {
  stream(handlers: StreamHandlers): () => void;
  limit(limit: number): { call(): Promise<CallResult> };
}

interface EventsHandle {
  cursor(cursor: string): EventsCursorHandle;
}

interface LedgersHandle {
  order(direction: 'asc' | 'desc'): {
    limit(limit: number): { call(): Promise<{ records: Array<{ sequence: number }> }> };
  };
}

/**
 * A controllable stand-in for `Horizon.Server`.
 *
 * `call()` (the REST poll path) can be failed with {@link down} or truncated
 * with {@link partialLimit}; the SSE path records its handlers so a test can
 * drive {@link emit} / {@link failStream}.
 */
export class ControllableHorizon {
  private records: RawHorizonEvent[] = [];
  private streamHandlers?: StreamHandlers;

  /** When true, every Horizon request rejects as if the endpoint is unreachable. */
  down = false;
  /** When set, `call()` returns at most this many records (a partial response). */
  partialLimit?: number;
  /** Number of `call()` invocations — SSE fallback and polling both go through it. */
  callCount = 0;
  /** Latest ledger sequence reported by `ledgers()`. */
  latestLedger = 0;

  seed(records: RawHorizonEvent[]): void {
    this.records = [...records].sort(
      (a, b) => Number(a.paging_token) - Number(b.paging_token),
    );
    this.latestLedger = records.reduce(
      (max, record) => Math.max(max, Number(record.ledger)),
      0,
    );
  }

  get hasStream(): boolean {
    return this.streamHandlers !== undefined;
  }

  /** Drives the `onerror` handler the poller attached to the SSE stream. */
  failStream(error: unknown): void {
    this.streamHandlers?.onerror(error);
  }

  /** Pushes an event through the `onmessage` handler (SSE delivery). */
  emit(record: RawHorizonEvent): void {
    this.streamHandlers?.onmessage(record);
  }

  events(): EventsHandle {
    return {
      cursor: (cursor: string): EventsCursorHandle => {
        const from = cursor === 'now' ? '0' : cursor;
        return {
          stream: (handlers: StreamHandlers): (() => void) => {
            this.streamHandlers = handlers;
            return () => {
              this.streamHandlers = undefined;
            };
          },
          limit: (limit: number) => ({
            call: async (): Promise<CallResult> => this.page(from, limit),
          }),
        };
      },
    };
  }

  ledgers(): LedgersHandle {
    return {
      order: (_direction: 'asc' | 'desc') => ({
        limit: (_limit: number) => ({
          call: async (): Promise<{ records: Array<{ sequence: number }> }> => {
            this.callCount += 1;
            if (this.down) {
              throw new Error('Horizon request failed: ECONNREFUSED');
            }
            return { records: [{ sequence: this.latestLedger }] };
          },
        }),
      }),
    };
  }

  private async page(from: string, limit: number): Promise<CallResult> {
    this.callCount += 1;
    if (this.down) {
      throw new Error('Horizon request failed: ECONNREFUSED');
    }
    const max = this.partialLimit ?? limit;
    const records = this.records
      .filter((record) => Number(record.paging_token) > Number(from))
      .slice(0, max);
    return { records };
  }
}

/**
 * A controllable ioredis substitute for `CacheService`.
 *
 * `down` reproduces a connection loss; {@link evictAll} reproduces Redis
 * evicting keys under memory pressure. Both are invisible to callers because
 * `CacheService` swallows Redis errors — which is the behaviour under test.
 */
export class ControllableRedis {
  private readonly store = new Map<string, string>();

  down = false;
  evictions = 0;

  /** `CacheService.onModuleInit` wires an `error`/`connect` listener; no-op here. */
  on(_event: string, _handler: (arg?: unknown) => void): this {
    return this;
  }

  async get(key: string): Promise<string | null> {
    this.assertUp();
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string, ..._args: unknown[]): Promise<'OK'> {
    this.assertUp();
    this.store.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    this.assertUp();
    return this.store.delete(key) ? 1 : 0;
  }

  async ping(): Promise<string> {
    this.assertUp();
    return 'PONG';
  }

  async info(_section?: string): Promise<string> {
    return 'used_memory:1024\nmaxmemory:0\n';
  }

  disconnect(): void {
    // nothing to tear down
  }

  /** Simulates a cache-wide eviction (e.g. `allkeys-lru` under memory pressure). */
  evictAll(): void {
    this.evictions += 1;
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  private assertUp(): void {
    if (this.down) {
      throw new Error('Redis connection is down (ECONNREFUSED)');
    }
  }
}

/**
 * A table with the production idempotency guard: a unique key (the event/tx
 * hash) plus `INSERT … ON CONFLICT DO NOTHING` semantics. Re-inserting a known
 * key is counted as a duplicate attempt but does not create a second row.
 */
export class IdempotentEventTable<T extends { id: string }> {
  private readonly rows = new Map<string, T>();

  /** Number of re-deliveries that were absorbed by the uniqueness guard. */
  duplicateAttempts = 0;

  /** Returns true when a new row was inserted, false when the key already existed. */
  insert(row: T): boolean {
    if (this.rows.has(row.id)) {
      this.duplicateAttempts += 1;
      return false;
    }
    this.rows.set(row.id, row);
    return true;
  }

  get size(): number {
    return this.rows.size;
  }

  ids(): string[] {
    return [...this.rows.keys()].sort();
  }
}

/** Type guard so the fake can be handed to `CacheService` without casts leaking. */
export function asRedisClient(
  fake: ControllableRedis,
): InstanceType<typeof Redis> {
  return fake as unknown as InstanceType<typeof Redis>;
}
