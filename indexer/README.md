# tikka-indexer

Blockchain event ingestion & query layer for the Tikka raffle platform.  
Subscribes to Stellar ledger events, decodes Tikka contract events, and writes structured data to PostgreSQL.

---

## Database Setup

### Prerequisites

| Requirement       | Version            |
| ----------------- | ------------------ |
| Node.js           | ≥ 20               |
| PostgreSQL        | ≥ 15               |
| (Optional) Docker | for local Postgres |

### Environment Variables

Create a `.env.local` file in this directory (the file is gitignored):

```dotenv
# Option A — single connection string (preferred)
DATABASE_URL=postgres://postgres:postgres@localhost:5432/tikka_indexer

# Option B — individual vars (used if DATABASE_URL is not set)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=tikka_indexer

# Set to "true" on Supabase / Railway (requires SSL)
DB_SSL=false

# Application port (default: 3002)
PORT=3002

# Health endpoint: Horizon URL for latest-ledger check (default: https://horizon.stellar.org)
HORIZON_URL=https://horizon.stellar.org

# Health: lag above this many ledgers is reported as degraded (default: 100)
LAG_THRESHOLD=100
```

### Local Postgres with Docker

```bash
docker run -d \
  --name tikka-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=tikka_indexer \
  -p 5432:5432 \
  postgres:16-alpine
```

---

## Running the Indexer

```bash
# Install dependencies
npm install

# Development (with hot-reload)
npm run start:dev

# Production
npm run build
npm start
```

> **Migrations run automatically** when the app bootstraps — no manual step needed.  
> TypeORM's `migrationsRun: true` applies all pending migrations before the server starts listening.

---

## Migrations

### Run pending migrations manually

```bash
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/tikka_indexer
npm run migration:run
```

### Revert the last migration

```bash
npm run migration:revert
```

### Generate a new migration after changing an entity

```bash
npm run migration:generate -- src/database/migrations/YourMigrationName
```

---

## Data Model

| Table            | Description                                      |
| ---------------- | ------------------------------------------------ |
| `raffles`        | One row per on-chain raffle                      |
| `tickets`        | One row per purchased ticket                     |
| `users`          | Aggregated per-address participation stats       |
| `raffle_events`  | Append-only log of decoded contract events       |
| `platform_stats` | Daily aggregate roll-ups                         |
| `indexer_cursor` | Singleton row tracking the last processed ledger |

Full schema specification: [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) § Data Model.

---

## Redis Cache TTL Strategy

The `CacheService` in `src/cache/` manages caching and invalidation using the following TTLs:

| Data Type              | Cache Key        | TTL  | Invalidation                                         |
| ---------------------- | ---------------- | ---- | ---------------------------------------------------- |
| **Active Raffle List** | `raffle:active`  | 30s  | On `RaffleCreated`, `RaffleCancelled`                |
| **Raffle Detail**      | `raffle:{id}`    | 10s  | On any raffle event (finalized, cancelled, purchase) |
| **Leaderboard**        | `leaderboard`    | 60s  | On `RaffleFinalized`                                 |
| **User Profile**       | `user:{address}` | 30s  | On `TicketPurchased`, `TicketRefunded` for that user |
| **Platform Stats**     | `stats:platform` | 5min | On daily rollup cron                                 |

Caching logic is wired into the processors in `src/processors/` to ensure consistency after database writes.

---

## Health Endpoint

`GET /health` is intended for orchestration and monitoring. It reports indexer lag, DB connectivity, and Redis connectivity.

### Response shape

| Field         | Type              | Description |
| ------------- | ----------------- | ----------- |
| `status`      | `'ok' \| 'degraded'` | `ok` when DB and Redis are up and lag is within threshold; `degraded` otherwise. |
| `lag_ledgers` | `number \| null`   | Current ledger (from Horizon) minus last processed ledger (cursor). `null` if Horizon is unreachable or cursor not yet set. |
| `db`          | `'ok' \| 'error'`  | PostgreSQL connectivity. |
| `redis`       | `'ok' \| 'error'`  | Redis connectivity (ping). |

- **HTTP 200**: `status === 'ok'`.
- **HTTP 503**: `status === 'degraded'` (e.g. lag &gt; `LAG_THRESHOLD`, or DB/Redis down).

Example (200):

```json
{ "status": "ok", "lag_ledgers": 12, "db": "ok", "redis": "ok" }
```

Example (503, degraded by lag):

```json
{ "status": "degraded", "lag_ledgers": 150, "db": "ok", "redis": "ok" }
```

### Alerting recommendations

- **Alert if `lag_ledgers` &gt; 100** (or your chosen threshold): indexer is falling behind; investigate ingestion pipeline or Horizon availability.
- **Alert if `db` === `'error'`**: database unreachable; check Postgres and network.
- **Alert if `redis` === `'error'`**: cache unreachable; optional for correctness but affects performance.
- Use HTTP 503 as a readiness probe failure in Kubernetes/orchestration so the instance is not sent traffic when degraded.

---

## Project Structure

```
src/
├── app.module.ts               # Root NestJS module
├── main.ts                     # Bootstrap entry point
├── data-source.ts              # TypeORM CLI DataSource (migration scripts)
├── config/
│   └── database.config.ts      # TypeORM config factory
├── cache/
│   ├── cache.module.ts
│   └── cache.service.ts        # Redis TTL strategies per data type
├── health/
│   ├── health.controller.ts   # GET /health
│   ├── health.module.ts
│   └── health.service.ts      # DB, Redis, Horizon lag checks
├── ingestor/
│   ├── cursor-manager.service.ts
│   └── ingestor.module.ts
├── processors/
│   ├── processors.module.ts
│   ├── raffle.processor.ts
│   └── user.processor.ts
└── database/
    ├── database.module.ts       # TypeOrmModule wiring
    ├── entities/
    │   ├── raffle.entity.ts
    │   ├── ticket.entity.ts
    │   ├── user.entity.ts
    │   ├── raffle-event.entity.ts
    │   ├── platform-stat.entity.ts
    │   └── indexer-cursor.entity.ts
    └── migrations/
        ├── 1700000000000-CreateRaffles.ts
        ├── 1700000000001-CreateTickets.ts
        ├── 1700000000002-CreateUsers.ts
        ├── 1700000000003-CreateRaffleEvents.ts
        ├── 1700000000004-CreatePlatformStats.ts
        └── 1700000000005-CreateIndexerCursor.ts
```
