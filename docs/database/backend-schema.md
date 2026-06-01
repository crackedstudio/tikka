# Backend Database Schema

**Service:** `tikka-backend`
**Database:** Supabase (shared PostgreSQL with oracle)
**ORM:** Raw SQL via `@supabase/supabase-js`
**Migration path:** `backend/database/migrations/`

## Tables

### `raffle_metadata`

| Column | Type | Notes |
|---|---|---|
| `raffle_id` | `INTEGER PK` | Raffle ID from contract/indexer |
| `title` | `TEXT` | |
| `description` | `TEXT` | |
| `image_url` | `TEXT` | Legacy single image |
| `image_urls` | `TEXT[]` | Multi-image support (migration 004) |
| `category` | `TEXT` | |
| `metadata_cid` | `TEXT` | IPFS CID |
| `search_vector` | `tsvector` | Generated full-text search (migration 007) |
| `deleted_at` | `TIMESTAMPTZ` | Soft-delete (migration 009) |
| `created_at` | `TIMESTAMPTZ` | |
| `updated_at` | `TIMESTAMPTZ` | |

**Owner:** Backend
**Migrations:** 001 (create), 004 (add image_urls), 007 (add search_vector), 009 (add deleted_at)
**Read:** Public (RLS policy excludes soft-deleted rows)
**Write:** Backend MetadataService
**RLS:** `Allow public read` (only non-deleted rows)

### `notifications`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID PK` | |
| `raffle_id` | `INTEGER NOT NULL` | |
| `user_address` | `VARCHAR(56) NOT NULL` | Stellar wallet |
| `channel` | `VARCHAR(20)` | email / push |
| `created_at` | `TIMESTAMPTZ` | |

**Owner:** Backend
**Migrations:** 002
**Read:** Backend NotificationService
**Write:** Backend NotificationService
**RLS:** Enabled, no public policy

### `oracle_jobs`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PK` | Oracle job ID |
| `status` | `TEXT` | pending / completed / failed |
| `enqueued_at` | `TIMESTAMPTZ` | |
| `updated_at` | `TIMESTAMPTZ` | |
| `confirmed_at` | `TIMESTAMPTZ` | |
| `latency_ms` | `INTEGER` | |
| `xdr` | `TEXT` | Raw XDR for failed jobs |
| `error_message` | `TEXT` | |

**Owner:** Backend (migration), no active writer found
**Migrations:** 003
**Read:** Backend MonitorService
**Write:** *(no active writer in codebase — likely placeholder for future oracle integration)*
**RLS:** Enabled, no public policy

### `push_tokens`

| Column | Type | Notes |
|---|---|---|
| `user_address` | `TEXT` | Composite PK |
| `device_token` | `TEXT` | Composite PK |
| `platform` | `TEXT` | fcm |
| `created_at` | `TIMESTAMPTZ` | |
| `updated_at` | `TIMESTAMPTZ` | |

**Owner:** Backend
**Migrations:** 005
**Read:** Backend PushNotificationService
**Write:** Backend PushNotificationService
**RLS:** Enabled, no public policy

### `refresh_tokens`

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGINT PK` | Identity |
| `user_address` | `TEXT NOT NULL` | |
| `token_hash` | `TEXT NOT NULL UNIQUE` | HMAC-SHA256 hash |
| `revoked` | `BOOLEAN` | |
| `created_at` | `TIMESTAMPTZ` | |
| `updated_at` | `TIMESTAMPTZ` | |
| `last_used_at` | `TIMESTAMPTZ` | |
| `expires_at` | `TIMESTAMPTZ` | |

**Owner:** Backend
**Migrations:** 006
**Read:** Backend AuthService
**Write:** Backend AuthService
**RLS:** Enabled, no public policy

### `siws_nonces`

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGINT PK` | Identity |
| `address` | `TEXT NOT NULL` | Stellar wallet |
| `nonce` | `TEXT NOT NULL` | |
| `issued_at` | `TIMESTAMPTZ` | |
| `expires_at` | `TIMESTAMPTZ` | |
| `consumed` | `BOOLEAN` | |
| `created_at` | `TIMESTAMPTZ` | |

**Owner:** Backend
**Migrations:** 008_siws_nonces
**Read:** Backend AuthService (implicit via insert/update)
**Write:** Backend AuthService
**RLS:** Enabled, no public policy

### `webhooks` (public)

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID PK` | |
| `owner_address` | `TEXT NOT NULL` | |
| `target_url` | `TEXT NOT NULL` | |
| `events` | `TEXT[]` | Event types subscribed |
| `secret` | `TEXT` | Webhook signing secret |
| `is_active` | `BOOLEAN` | |
| `failure_count` | `INTEGER` | |
| `created_at` | `TIMESTAMPTZ` | |

**Owner:** Backend
**Migrations:** 008_webhooks
**Read:** Backend WebhookService, webhook owners (via RLS)
**Write:** Backend WebhookService, webhook owners (via RLS)
**RLS:** `Users can manage their own webhooks` (JWT claim match)

### `webhook_deliveries`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID PK` | |
| `webhook_id` | `UUID FK` | References webhooks(id) |
| `event_type` | `TEXT` | |
| `payload` | `JSONB` | |
| `status_code` | `INTEGER` | |
| `response_body` | `TEXT` | |
| `error_message` | `TEXT` | |
| `success` | `BOOLEAN` | |
| `created_at` | `TIMESTAMPTZ` | |

**Owner:** Backend
**Migrations:** 008_webhooks
**Read:** Webhook owners (via RLS, linked to webhooks)
**Write:** Backend WebhookService
**RLS:** `Users can view deliveries for their webhooks`

### `notification_subscriptions`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID PK` | |
| `address` | `TEXT NOT NULL` | |
| `device_token` | `TEXT` | |
| `channel` | `TEXT` | |
| `event_preferences` | `JSONB` | |
| `status` | `TEXT` | active / inactive / revoked |
| `created_at` | `TIMESTAMPTZ` | |
| `updated_at` | `TIMESTAMPTZ` | |

**Owner:** Backend
**Migrations:** 009_notification_subscriptions
**Read:** Backend
**Write:** Backend
**RLS:** Enabled, no public policy

### `audit_logs`

**Note:** No migration file found in `backend/database/migrations/`. Likely created manually via Supabase dashboard.

**Owner:** Backend
**Read:** Backend MonitorService
**Write:** Backend MonitorService

## Read/Write Matrix

| Service | Tables Read | Tables Written |
|---|---|---|
| MetadataService | `raffle_metadata` | `raffle_metadata` |
| SearchService | *(via MetadataService + indexer API)* | — |
| NotificationService | `notifications` | `notifications` |
| PushNotificationService | `push_tokens` | `push_tokens`, `push_delivery_failures` |
| AuthService | `refresh_tokens` | `siws_nonces`, `refresh_tokens` |
| WebhookService | `webhooks`, `webhook_deliveries` | `webhooks`, `webhook_deliveries` |
| MonitorService | `oracle_jobs`, `audit_logs` | `audit_logs` |
