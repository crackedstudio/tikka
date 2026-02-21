# Tikka Indexer

Ingests Stellar/Soroban ledger events, decodes them to domain events, and persists to PostgreSQL with optional Redis caching. Powers historical queries (leaderboard, user history, analytics) without hitting Soroban RPC directly.

**Stack:** NestJS, PostgreSQL, Redis, Horizon API.

## Intended structure (from spec)

- `src/ingestor/` — ledger poller (Horizon /events), event parser (XDR decode), cursor manager
- `src/processors/` — raffle, ticket, user, stats processors
- `src/database/entities/` — raffle, ticket, user, raffle-event, platform-stat, indexer_cursor
- `src/cache/` — Redis TTL strategies
- `src/api/` — internal HTTP API for the backend to query
- `src/health/` — /health (lag, DB, Redis)

Implementation to be added.

## Architecture

Full ecosystem spec: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) (section 3 — tikka-indexer).

### Redis Cache TTL Strategy

The `CacheService` in `src/cache/` manages caching and invalidation using the following TTLs:

| Data Type | Cache Key | TTL | Invalidation (manual) |
|---|---|---|---|
| **Active Raffle List** | `raffle:active` | 30s | On `RaffleCreated`, `RaffleCancelled` |
| **Raffle Detail** | `raffle:{id}` | 10s | On any raffle event (finalized, cancelled, purchase) |
| **Leaderboard** | `leaderboard` | 60s | On `RaffleFinalized` |
| **User Profile** | `user:{address}` | 30s | On `TicketPurchased`, `TicketRefunded` for that user |
| **Platform Stats** | `stats:platform` | 5min | On daily rollup cron |

Caching logic is wired into the processors in `src/processors/` to ensure consistency after database writes.
