# Indexer integration tests

These tests exercise real PostgreSQL (via Testcontainers) and TypeORM against indexer processors, migrations, and services. Unit tests (`npm test`) skip this folder; use `npm run test:integration` here.

## Prerequisites

| Requirement | Notes |
| ----------- | ----- |
| Node.js ≥ 20 | Same as the indexer package |
| Docker running | Testcontainers starts a throwaway `postgres:16-alpine` per suite — **you do not need** `docker-compose.yml` or a local Postgres for these tests |
| `npm install` in `indexer/` | Pulls `@testcontainers/postgresql` and friends |

`indexer/docker-compose.yml` (Postgres + Redis) is for running the app locally, not for integration tests.

## Running tests

From the `indexer/` directory:

```bash
# All integration suites (serial; ~3 min timeout per test)
npm run test:integration

# One file
npx jest --config jest.integration.config.js --forceExit --runInBand \
  src/test/integration/ingestion-pipeline.integration.spec.ts
```

Config lives in `jest.integration.config.js`:

- Matches `*.integration.spec.ts` under `src/`
- `maxWorkers: 1` / `--runInBand` so containers do not fight for resources
- `testTimeout: 180_000` for image pull + first container start

First run may be slow while Docker pulls `postgres:16-alpine`.

## Helpers (`helpers/`)

### `db-container.ts` — Postgres lifecycle

Spins up a temporary Postgres, builds a TypeORM `DataSource`, runs migrations, and tears down.

| Export | Purpose |
| ------ | ------- |
| `startDb()` | Start container → connect → `runMigrations` → `{ container, dataSource }` |
| `stopDb(ctx)` | Destroy the DataSource and stop the container (`afterAll`) |
| `buildDataSource(container)` | Build a new DataSource against an **existing** container (crash/reconnect scenarios) |
| `CONTAINER_STARTUP_MS` | Pass as Jest timeout on `beforeAll` (120s) |
| `DbContainerContext` | Type of the value returned by `startDb()` |

Typical lifecycle:

```ts
let ctx: DbContainerContext;

beforeAll(async () => {
  ctx = await startDb();
}, CONTAINER_STARTUP_MS);

afterAll(async () => {
  await stopDb(ctx);
});
```

### `mock-events.ts` — Event / payload factories

Factories that mirror decoded Soroban event payloads and `DomainEvent` shapes. Override any field via the optional `overrides` argument.

| Kind | Examples |
| ---- | -------- |
| Addresses | `CREATOR_ADDRESS`, `BUYER_ADDRESS`, `BUYER2_ADDRESS` |
| Tx hashes | `mockTxHash(seed)` |
| Processor payloads | `makeRaffleCreated()`, `makeTicketPurchased()`, `makeRaffleFinalized()`, `makeRaffleCancelled()`, `makeTicketRefunded()` |
| Domain events | `makeRaffleCreatedEvent()`, `makeTicketPurchasedEvent()`, … |
| Raw ingestion | `makeRawIngestionEvent(eventType, overrides?)` |

### `all-migrations.ts` — Full migration list

Ordered list of **every** indexer migration (`ALL_INDEXER_MIGRATIONS`), used by rollback/smoke-style suites that must exercise the complete chain (not only the subset wired into `startDb()`). Also exports `DEFAULT_ROLLBACK_COUNT`.

## Seeding and isolation

There is no shared seed script. Each suite seeds what it needs:

1. **`startDb()`** leaves a migrated, empty schema.
2. **Insert rows** with `dataSource.getRepository(Entity).save(...)`, often driven by `makeRaffleCreated()` / similar factories so FK parents exist.
3. **Truncate between tests** so cases stay independent. Disable FK checks briefly, truncate, then restore:

```ts
beforeEach(async () => {
  await ds.query(`SET session_replication_role = 'replica'`);
  await ds.query(
    `TRUNCATE TABLE raffle_events, tickets, users, raffles RESTART IDENTITY CASCADE`,
  );
  await ds.query(`SET session_replication_role = 'DEFAULT'`);
});
```

Adjust the table list to whatever your suite touches (e.g. `dead_letter_events`, `indexer_cursor`).

Stub out non-DB collaborators (cache, webhooks, dispatchers) with Jest mocks so the suite focuses on persistence.

## Annotated example

Minimal suite: start DB → seed a raffle → run a processor → assert rows. Save as something like `my-feature.integration.spec.ts` next to the other specs.

```ts
/**
 * Example: TicketPurchased writes ticket rows and bumps raffle.ticketsSold.
 *
 * Flow: Testcontainers Postgres → migrate → seed raffle → TicketProcessor → assert.
 */
import { DataSource, Repository } from 'typeorm';
import { TicketProcessor } from '../../processors/ticket.processor';
import { UserProcessor } from '../../processors/user.processor';
import { RaffleEntity, RaffleStatus } from '../../database/entities/raffle.entity';
import { TicketEntity } from '../../database/entities/ticket.entity';
import {
  startDb,
  stopDb,
  DbContainerContext,
  CONTAINER_STARTUP_MS,
} from './helpers/db-container';
import {
  BUYER_ADDRESS,
  makeRaffleCreated,
  makeTicketPurchased,
} from './helpers/mock-events';

// Cache is out of scope for DB integration tests — stub invalidation.
const mockCacheService = {
  invalidateActiveRaffles: jest.fn().mockResolvedValue(undefined),
  invalidateRaffleDetail: jest.fn().mockResolvedValue(undefined),
  invalidateUserProfile: jest.fn().mockResolvedValue(undefined),
  invalidateLeaderboard: jest.fn().mockResolvedValue(undefined),
};

let ctx: DbContainerContext;
let ds: DataSource;
let raffleRepo: Repository<RaffleEntity>;
let ticketRepo: Repository<TicketEntity>;
let ticketProcessor: TicketProcessor;

/** Seed a parent raffle so ticket FKs succeed. */
async function seedRaffle(): Promise<void> {
  const f = makeRaffleCreated(); // defaults + optional overrides
  await raffleRepo.save(
    raffleRepo.create({
      id: f.raffleId,
      creator: f.creator,
      ticketPrice: f.ticketPrice,
      maxTickets: f.maxTickets,
      asset: f.asset,
      endTime: f.endTime,
      createdLedger: f.createdLedger,
      status: RaffleStatus.OPEN,
    }),
  );
}

beforeAll(async () => {
  ctx = await startDb(); // container + migrated DataSource
  ds = ctx.dataSource;
  raffleRepo = ds.getRepository(RaffleEntity);
  ticketRepo = ds.getRepository(TicketEntity);

  const userProcessor = new UserProcessor(ds, mockCacheService as any);
  ticketProcessor = new TicketProcessor(ds, mockCacheService as any, userProcessor);
}, CONTAINER_STARTUP_MS);

afterAll(async () => {
  await stopDb(ctx); // always tear down the container
});

beforeEach(async () => {
  jest.clearAllMocks();
  await ds.query(`SET session_replication_role = 'replica'`);
  await ds.query(
    `TRUNCATE TABLE raffle_events, tickets, users, raffles RESTART IDENTITY CASCADE`,
  );
  await ds.query(`SET session_replication_role = 'DEFAULT'`);
});

describe('TicketPurchased → DB (example)', () => {
  beforeEach(() => seedRaffle());

  it('inserts ticket rows for the buyer', async () => {
    const f = makeTicketPurchased({ ticketIds: [10, 11], ledger: 600 });

    await ticketProcessor.handleTicketPurchased(
      f.raffleId,
      f.buyer,
      f.ticketIds,
      f.totalCost,
      f.ledger,
      f.txHash,
    );

    const tickets = await ticketRepo.findBy({ raffleId: 1 });
    expect(tickets).toHaveLength(2);
    expect(tickets.map((t) => t.id).sort()).toEqual([10, 11]);
    expect(tickets[0].owner).toBe(BUYER_ADDRESS);

    const raffle = await raffleRepo.findOneBy({ id: 1 });
    expect(raffle!.ticketsSold).toBe(2);
  });
});
```

For fuller real suites, see `ingestion-pipeline.integration.spec.ts` (processors + DB), `cursor-recovery.integration.spec.ts` (`buildDataSource` reconnect), and `migration-rollback.integration.spec.ts` (`ALL_INDEXER_MIGRATIONS`).

## Checklist for a new integration test

1. Name the file `*.integration.spec.ts` under `src/test/integration/`.
2. Ensure Docker is running; run `npm run test:integration` (or target your file with Jest as above).
3. Use `startDb` / `stopDb` with `CONTAINER_STARTUP_MS` on `beforeAll`.
4. Seed with repositories + `mock-events` factories; truncate in `beforeEach`.
5. Prefer asserting database state over mocking TypeORM.
