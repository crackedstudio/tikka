# Redis setup

Redis is a core dependency of Tikka. It backs:

- **Queues (BullMQ)** — the indexer uses [BullMQ](https://docs.bullmq.io/) for
  background job processing (`indexer/src/processors`, `indexer/src/webhooks`).
- **Cache** — the backend uses Redis (via `ioredis`) as a cache-aside layer for
  metadata reads (`REDIS_URL` in `backend/.env.example`).

Both the backend and indexer connect through the `REDIS_URL` environment
variable (default `redis://localhost:6379`, or `redis://redis:6379` inside the
Docker network).

## Required version

- **Redis 7.x** (Alpine image `redis:7-alpine`).

BullMQ requires Redis **6.2.0 or newer** and does not support Redis Cluster in a
way that guarantees atomicity for its Lua scripts; run a single primary (with
optional replicas). We standardise on Redis 7 to match the `docker-compose.yml`
service and to get the newer `BRPOPLPUSH`/blocking-command and memory
improvements BullMQ benefits from.

## Eviction policy — `noeviction` (required for queues)

The `maxmemory-policy` **must be `noeviction`**.

BullMQ stores job state (job hashes, wait/active/delayed lists, and its own
bookkeeping keys) directly in Redis. If Redis is allowed to evict keys under
memory pressure (`allkeys-lru`, `volatile-lru`, `allkeys-random`, etc.), it can
silently drop job or queue keys. That corrupts queue state: jobs disappear,
counters drift, and workers can stall or reprocess. BullMQ's own documentation
requires `maxmemory-policy noeviction` for exactly this reason.

Because the same Redis instance also serves the backend cache, **do not rely on
Redis eviction to bound memory**. Instead:

- Keep queue growth bounded at the application layer. Our BullMQ jobs already set
  `removeOnComplete` / `removeOnFail` (see
  `indexer/src/processors/queue-options.ts`) so completed/failed jobs are
  trimmed automatically.
- Give cache entries an explicit TTL so they expire rather than accumulate
  (the backend cache-aside reads use a TTL — see `backend/.env.example`).
- Alert on memory usage (see `redis/OPERATIONAL.md`) so operators intervene
  before `maxmemory` is reached. With `noeviction`, writes fail once the limit
  is hit rather than corrupting queue state — a fail-loud posture we prefer.

If you ever run cache and queues on separate Redis instances, the cache
instance may use an LRU policy, but any instance BullMQ touches must stay
`noeviction`.

## Persistence (AOF / RDB)

Enable persistence so queued jobs survive a Redis restart:

- **AOF (append-only file) enabled** with `appendfsync everysec` — this is the
  recommended default. It bounds data loss to roughly one second of writes on a
  crash while keeping throughput high, which matters because in-flight BullMQ
  jobs live only in Redis.
- **RDB snapshots** are kept as a secondary, faster-to-load backup (the default
  `save` points are fine). AOF is authoritative on restart.

For production, persist the AOF/RDB files to durable, backed-up storage and test
restore of critical keyspaces (tracked in `redis/OPERATIONAL.md`).

> Cache-only data is regenerable, so persistence is really about protecting
> queue state. Do not disable AOF on any instance BullMQ uses.

## Local setup (docker-compose)

The repository `docker-compose.yml` runs Redis with the settings above:

```yaml
redis:
  image: redis:7-alpine
  command:
    - redis-server
    - --maxmemory-policy
    - noeviction
    - --appendonly
    - "yes"
    - --appendfsync
    - everysec
  ports:
    - "6379:6379"
  volumes:
    - redis-data:/data
```

Start just the shared dependencies (Postgres + Redis):

```bash
docker compose --profile deps up -d
```

Or bring up a service and its dependencies, e.g. the indexer:

```bash
docker compose --profile indexer up -d
```

Verify the running config matches this document:

```bash
docker compose exec redis redis-cli config get maxmemory-policy   # -> noeviction
docker compose exec redis redis-cli config get appendonly         # -> yes
docker compose exec redis redis-cli ping                          # -> PONG
```

## Summary

| Setting            | Value                        | Why                                              |
| ------------------ | ---------------------------- | ------------------------------------------------ |
| Version            | Redis 7.x (`redis:7-alpine`) | BullMQ needs 6.2+; standardised on 7             |
| `maxmemory-policy` | `noeviction`                 | Prevents eviction from corrupting BullMQ queues  |
| Persistence        | AOF (`everysec`) + RDB       | In-flight jobs survive restarts                  |
| Local run          | `docker compose --profile deps up -d` | Postgres + Redis with the settings above |
