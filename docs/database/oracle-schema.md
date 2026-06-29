# Oracle Database Schema

**Service:** `tikka-oracle`
**Database:** Supabase (shared PostgreSQL with backend)
**ORM:** Raw SQL via `@supabase/supabase-js`
**Migration path:** `oracle/database/migrations/`

## Tables

### `vrf_audit_log`

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGSERIAL PK` | |
| `raffle_id` | `INTEGER UNIQUE NOT NULL` | One audit record per raffle |
| `request_id` | `TEXT` | |
| `commitment_hash` | `TEXT NOT NULL` | |
| `reveal_hash` | `TEXT` | |
| `proof` | `TEXT` | |
| `seed` | `TEXT` | |
| `oracle_public_key` | `TEXT NOT NULL` | |
| `status` | `TEXT` | committed / revealed / abandoned |
| `committed_at` | `TIMESTAMPTZ NOT NULL` | |
| `revealed_at` | `TIMESTAMPTZ` | |
| `ledger_sequence` | `INTEGER` | |
| `chain_hash` | `TEXT NOT NULL` | |

**Owner:** Oracle
**Migrations:** 008_vrf_audit_log
**Read:** Public (RLS: `public_select`), Oracle AuditLogService
**Write:** Oracle AuditLogService (createCommitRecord, updateRevealRecord, markAbandoned)
**RLS:** Public SELECT allowed

### `oracle_draw_requests`

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGSERIAL PK` | |
| `request_identity` | `TEXT UNIQUE NOT NULL` | Idempotency key |
| `ledger_sequence` | `INTEGER NOT NULL` | |
| `tx_hash` | `TEXT NOT NULL` | |
| `event_index` | `INTEGER NOT NULL` | |
| `raffle_id` | `INTEGER NOT NULL` | |
| `contract_request_id` | `TEXT NOT NULL` | |
| `replayed` | `BOOLEAN` | |
| `first_seen_at` | `TIMESTAMPTZ` | |

**Owner:** Oracle
**Migrations:** 009_oracle_draw_request_idempotency
**Read:** Oracle DrawRequestLedgerService (via UNIQUE violation detection)
**Write:** Oracle DrawRequestLedgerService

### `oracle_draw_request_replays`

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGSERIAL PK` | |
| `request_identity` | `TEXT NOT NULL` | Non-unique (multiple replays tracked) |
| `ledger_sequence` | `INTEGER NOT NULL` | |
| `tx_hash` | `TEXT NOT NULL` | |
| `event_index` | `INTEGER NOT NULL` | |
| `raffle_id` | `INTEGER NOT NULL` | |
| `contract_request_id` | `TEXT NOT NULL` | |
| `replayed_at` | `TIMESTAMPTZ` | |

**Owner:** Oracle
**Migrations:** 009_oracle_draw_request_idempotency
**Read:** Oracle internal
**Write:** Oracle DrawRequestLedgerService

### `push_delivery_failures`

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGSERIAL PK` | |
| `user_address` | `TEXT NOT NULL` | |
| `device_token` | `TEXT` | |
| `error_code` | `TEXT NOT NULL` | |
| `classification` | `TEXT` | transient_retry / permanent_invalid_token / permanent_other / provider_outage |
| `next_action` | `TEXT` | retry / remove_token / drop |
| `created_at` | `TIMESTAMPTZ` | |

**Owner:** Oracle (migration), Backend (writer)
**Migrations:** push_delivery_failures
**Read:** Operators (manual), no service reader found
**Write:** Backend PushNotificationService
**Note:** Schema defined by oracle migration; runtime writes come from backend. This is a shared concern.

## Read/Write Matrix

| Service | Tables Read | Tables Written |
|---|---|---|
| AuditLogService | `vrf_audit_log` | `vrf_audit_log` |
| DrawRequestLedgerService | `oracle_draw_requests` | `oracle_draw_requests`, `oracle_draw_request_replays` |
| Backend PushNotificationService | — | `push_delivery_failures` |

## Cross-Service Notes

- The oracle shares the Supabase instance with the backend. Both use `service_role_key` for writes.
- `oracle_jobs` (migration `003_oracle_jobs.sql` in backend) is a backend-owned table for oracle observability. No active writer exists in the codebase — it is read by backend's MonitorService for admin dashboards.
- `push_delivery_failures` is a cross-service table: oracle defined the schema, backend writes the records. Be cautious when modifying this table — coordinate with both teams.
