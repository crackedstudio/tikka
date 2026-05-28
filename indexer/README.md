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

# Health: lag above this many ledgers triggers critical alerts and notifications (default: 50)
INDEXER_LAG_ALERT_THRESHOLD_LEDGERS=50
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

## Redis Memory Management and Monitoring

- Config file: `indexer/redis.conf`
- `maxmemory 4gb`, `maxmemory-policy allkeys-lru`, `maxmemory-samples 5`.
- Eviction policy: `allkeys-lru`, to keep frequently-accessed data and evict least recently used keys across all key namespaces.
- TTLs are still used in CacheService for key lifecycle control.

### Monitoring

CacheService periodically calls Redis `INFO memory` and logs:

- WARNING when usage >= 80%
- CRITICAL when usage >= 90%

Data monitored:

- `used_memory`
- `maxmemory`
- `memory usage percentage`

### Cache hit/miss tracking

`CacheService` tracks per bucket:

- `raffles`, `users`, `stats`, `others`
- `hits`, `misses`, `requests`
- `hit rate` (percent) via `getAllCacheHitRates()`

Use this data to detect hot sets and to tune TTLs per data type.

### Best practice

1. Set `maxmemory` to ~50% of host RAM for dedicated cache nodes.
2. Use `allkeys-lru` for general purpose cache with mixed TTL keys.
3. Enable Redis slowlog & keyspace notifications for degraded performance debugging.
4. Scale horizontally with Redis Cluster if items exceed node limit.

---

## Health Endpoint

`GET /health` is intended for orchestration and monitoring. It reports indexer lag, DB connectivity, and Redis connectivity.

### Response shape

| Field              | Type                                    | Description                                                                                                                                      |
| ------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `status`           | `'ok' \| 'degraded'`                    | `ok` when DB and Redis are up and lag is within threshold; `degraded` otherwise.                                                                 |
| `lag_ledgers`      | `number \| null`                        | Current ledger (from Horizon) minus last processed ledger (cursor). `null` if Horizon is unreachable or cursor not yet set.                      |
| `lagStatus`        | `'healthy' \| 'degraded' \| 'critical'` | Lag status based on alert thresholds. `healthy` ≤ alert threshold, `degraded` > LAG_THRESHOLD, `critical` > INDEXER_LAG_ALERT_THRESHOLD_LEDGERS. |
| `db`               | `'ok' \| 'error'`                       | PostgreSQL connectivity.                                                                                                                         |
| `redis`            | `'ok' \| 'error'`                       | Redis connectivity (ping).                                                                                                                       |
| `redis_latency_ms` | `number \| null`                        | Redis ping latency in milliseconds.                                                                                                              |
| `dlq_size`         | `number`                                | Number of events in the dead-letter queue.                                                                                                       |

- **HTTP 200**: `status === 'ok'`.
- **HTTP 503**: `status === 'degraded'` (e.g. lag &gt; `LAG_THRESHOLD`, or DB/Redis down).

Example (200):

```json
{
  "status": "ok",
  "lag_ledgers": 12,
  "lagStatus": "healthy",
  "db": "ok",
  "redis": "ok",
  "redis_latency_ms": 5,
  "dlq_size": 0
}
```

Example (503, degraded by lag):

```json
{
  "status": "degraded",
  "lag_ledgers": 150,
  "lagStatus": "critical",
  "db": "ok",
  "redis": "ok",
  "redis_latency_ms": 8,
  "dlq_size": 0
}
```

### Lag Alerts and Event Emission

The indexer emits `indexer_lag_alert` events when the lag status crosses into critical territory. This allows external services (like PushNotificationService in the backend) to receive real-time notifications.

**Event payload:**

```json
{
  "lag_ledgers": 75,
  "threshold": 50,
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**To listen for lag alerts:**

```typescript
// In your service constructor
constructor(private healthService: HealthService) {
  healthService.getEventEmitter().on('indexer_lag_alert', (alert) => {
    console.log('Critical lag detected:', alert);
    // Send notification, trigger alert, etc.
  });
}
```

### Alerting recommendations

- **Alert if `lag_ledgers` &gt; 100** (or your chosen threshold): indexer is falling behind; investigate ingestion pipeline or Horizon availability.
- **Alert if `lagStatus` === `'critical'`**: indexer is severely lagging; investigate ingestion pipeline or Horizon availability.
- **Alert if `db` === `'error'`**: database unreachable; check Postgres and network.
- **Alert if `redis` === `'error'`**: cache unreachable; optional for correctness but affects performance.
- Use HTTP 503 as a readiness probe failure in Kubernetes/orchestration so the instance is not sent traffic when degraded.

### Kubernetes Liveness Probe

For Kubernetes deployments, you can configure liveness probes that fail when `lagStatus === 'critical'`. See `kubernetes/liveness-probe-example.yaml` for complete examples.

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
├── api/
│   ├── api.module.ts            # Internal HTTP API
│   └── controllers/
│       ├── raffles.controller.ts
│       ├── users.controller.ts
│       ├── leaderboard.controller.ts
│       └── stats.controller.ts
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

## Resource Guidelines

- **CPU**: 200m requests, 1000m limits
- **Memory**: 512Mi requests, 1Gi limits
  Indexer is optimized for single-replica execution.
