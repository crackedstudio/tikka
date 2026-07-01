# Indexer Database Schema

**Service:** `tikka-indexer`
**Database:** Separate PostgreSQL (not shared with backend/oracle)
**ORM:** TypeORM 0.3.x via `@nestjs/typeorm`
**Migration path:** `indexer/src/database/migrations/`
**Entities:** `indexer/src/database/entities/`

## Tables

### `raffles`

| Column | Type | Notes |
|---|---|---|
| `id` | `INTEGER PK` | Raffle ID from contract |
| `status` | `TEXT` | open / drawing / finalized / cancelled |
| `creator` | `VARCHAR(56)` | Stellar address |
| `price` | `BIGINT` | Ticket price in stroops |
| `asset` | `VARCHAR(100)` | Stellar asset code |
| `asset_issuer` | `VARCHAR(56)` | Asset issuer (native = null) |
| `max_tickets` | `INTEGER` | |
| `max_entries_per_user` | `INTEGER` | |
| `start_time` | `TIMESTAMP` | Ledger close time |
| `end_time` | `TIMESTAMP` | |
| `winner` | `VARCHAR(56)` | Winner address (nullable) |
| `winning_ticket_id` | `INTEGER` | Added in migration 1720000000002 |
| `prize_xlm` | `BIGINT` | |
| `total_tickets_sold` | `INTEGER` | |
| `ledger` | `INTEGER` | Creation ledger sequence |
| `tx_hash` | `VARCHAR(64)` | Creation tx hash |
| `created_at` | `TIMESTAMP` | |
| `updated_at` | `TIMESTAMP` | |

**Owner:** Indexer
**Migrations:** 1700000000000 (create), 1720000000002 (add winning_ticket_id)
**Read:** Indexer API controllers
**Write:** Indexer RaffleProcessor
**Cross-service:** Backend reads via HTTP API (not direct DB)

### `tickets`

| Column | Type | Notes |
|---|---|---|
| `id` | `INTEGER PK` | |
| `raffle_id` | `INTEGER FK` | References raffles(id) |
| `owner` | `VARCHAR(56)` | Stellar address |
| `purchase_tx_hash` | `VARCHAR(64) UNIQUE` | For idempotency |
| `refunded` | `BOOLEAN` | |
| `purchased_at` | `TIMESTAMP` | |
| `created_at` | `TIMESTAMP` | |

**Owner:** Indexer
**Migrations:** 1700000000001
**Read:** Indexer API controllers
**Write:** Indexer TicketProcessor
**Cross-service:** Backend reads via HTTP API (not direct DB)

### `users`

| Column | Type | Notes |
|---|---|---|
| `address` | `VARCHAR(56) PK` | Stellar wallet (natural key) |
| `total_tickets_bought` | `INTEGER` | |
| `total_raffles_won` | `INTEGER` | |
| `total_raffles_participated` | `INTEGER` | |
| `total_prize_xlm` | `BIGINT` | |
| `total_spent_xlm` | `BIGINT` | |
| `last_tx_hash` | `VARCHAR(64)` | Added in migration 1720000000001 |
| `first_seen_at` | `TIMESTAMP` | |
| `last_active_at` | `TIMESTAMP` | |
| `created_at` | `TIMESTAMP` | |
| `updated_at` | `TIMESTAMP` | |

**Owner:** Indexer
**Migrations:** 1700000000002 (create), 1720000000001 (add last_tx_hash)
**Read:** Indexer API controllers (including leaderboard)
**Write:** Indexer UserProcessor
**Cross-service:** Backend reads via HTTP API (not direct DB)

### `raffle_events`

| Column | Type | Notes |
|---|---|---|
| `id` | `INTEGER PK` | |
| `raffle_id` | `INTEGER` | |
| `event_type` | `TEXT` | |
| `tx_hash` | `VARCHAR(64) UNIQUE` | Idempotency |
| `ledger` | `INTEGER` | |
| `data` | `JSONB` | Event payload |
| `schema_version` | `INTEGER` | Added in migration 1720000000003 |
| `processed` | `BOOLEAN` | |
| `created_at` | `TIMESTAMP` | |

**Owner:** Indexer
**Migrations:** 1700000000003 (create), 1720000000003 (add schema_version)
**Read:** Indexer internal
**Write:** Indexer EventParser / IngestionDispatcher

### `platform_stats`

| Column | Type | Notes |
|---|---|---|
| `date` | `DATE PK` | Natural key |
| `total_active_raffles` | `INTEGER` | |
| `total_tickets_sold` | `INTEGER` | |
| `total_volume_xlm` | `BIGINT` | |
| `total_users` | `INTEGER` | |
| `total_raffles_created` | `INTEGER` | |
| `total_raffles_completed` | `INTEGER` | |
| `created_at` | `TIMESTAMP` | |
| `updated_at` | `TIMESTAMP` | |

**Owner:** Indexer
**Migrations:** 1700000000004
**Read:** Indexer stats controller
**Write:** Indexer StatsProcessor (cron)
**Cross-service:** Backend reads via HTTP API

### `platform_state`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PK` | Singleton ('global') |
| `platform_paused` | `BOOLEAN` | |
| `admin_address` | `VARCHAR(56)` | |
| `created_at` | `TIMESTAMP` | |
| `updated_at` | `TIMESTAMP` | |

**Owner:** Indexer
**Migrations:** 1700000000006
**Read:** Indexer AdminProcessor
**Write:** Indexer AdminProcessor

### `indexer_cursor`

| Column | Type | Notes |
|---|---|---|
| `id` | `INTEGER PK` | Singleton (1) |
| `last_ledger` | `INTEGER` | |
| `paging_token` | `TEXT` | |
| `ledger_hashes` | `JSONB` | Added in migration 1730000000001 |
| `updated_at` | `TIMESTAMP` | |

**Owner:** Indexer
**Migrations:** 1700000000005 (create), 1730000000001 (add ledger_hashes)
**Read:** Indexer CursorManagerService
**Write:** Indexer CursorManagerService

### `webhooks` (internal)

| Column | Type | Notes |
|---|---|---|
| `id` | `INTEGER PK` | |
| `url` | `TEXT NOT NULL` | |
| `events` | `TEXT[]` | Event types |
| `failure_count` | `INTEGER` | |
| `is_active` | `BOOLEAN` | |
| `created_at` | `TIMESTAMP` | |
| `updated_at` | `TIMESTAMP` | |

**Owner:** Indexer
**Migrations:** 1720000000000
**Read:** Indexer WebhookService
**Write:** Indexer WebhookService
**Note:** This is a separate `webhooks` table from the backend's. Backend webhooks are user-facing (Supabase); indexer webhooks are for internal event dispatch.

### `dead_letter_events`

| Column | Type | Notes |
|---|---|---|
| `id` | `INTEGER PK` | |
| `event_type` | `TEXT` | |
| `payload` | `JSONB` | |
| `reason` | `TEXT` | Failure reason |
| `ledger` | `INTEGER` | |
| `retry_count` | `INTEGER` | |
| `replayed_at` | `TIMESTAMPTZ` | |
| `created_at` | `TIMESTAMP` | |

**Owner:** Indexer
**Migrations:** 1730000000000
**Read:** Indexer DeadLetterQueueService
**Write:** Indexer DeadLetterQueueService

### `archive_checkpoints`

| Column | Type | Notes |
|---|---|---|
| `id` | `INTEGER PK` | |
| `job_type` | `TEXT` | Type of archiving job |
| `last_archived_id` | `INTEGER` | |
| `last_archived_at` | `TIMESTAMP` | |
| `status` | `TEXT` | |
| `created_at` | `TIMESTAMP` | |
| `updated_at` | `TIMESTAMP` | |

**Owner:** Indexer
**Migrations:** 1748589373000
**Read:** Indexer ArchiveService
**Write:** Indexer ArchiveService

## Read/Write Matrix

| Service | Tables Read | Tables Written |
|---|---|---|
| RaffleProcessor | `raffles` | `raffles` |
| TicketProcessor | `tickets` | `tickets` |
| UserProcessor | `users` | `users` |
| StatsProcessor | `platform_stats` | `platform_stats` |
| EventParser | `raffle_events` | `raffle_events` |
| CursorManagerService | `indexer_cursor` | `indexer_cursor` |
| AdminProcessor | `platform_state` | `platform_state` |
| WebhookService | `webhooks` | `webhooks` |
| DeadLetterQueueService | `dead_letter_events` | `dead_letter_events` |
| ArchiveService | `archive_checkpoints` | `archive_checkpoints` |

## Cross-Service Access

The backend reads indexer data exclusively via the indexer's HTTP REST API — never via direct database connection. Endpoints used:

| Backend Service | Indexer API Endpoint |
|---|---|
| IndexerService | `GET /raffles`, `GET /raffles/:id` |
| UsersService | `GET /users/:address` |
| LeaderboardService | `GET /leaderboard` |
| StatsService | `GET /stats/platform` |
| SearchService | *(combines metadata + indexer raffle data)* |
