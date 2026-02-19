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
