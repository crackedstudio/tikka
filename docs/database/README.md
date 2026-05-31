# Database Schema Ownership

## Database Instances

| Instance | Services | Access Method |
|---|---|---|
| **Supabase (shared PostgreSQL)** | `tikka-backend`, `tikka-oracle` | `@supabase/supabase-js` with `service_role_key` |
| **Indexer PostgreSQL** | `tikka-indexer` | TypeORM (`@nestjs/typeorm`) |

The backend and oracle share a single Supabase PostgreSQL instance. The indexer runs its own separate PostgreSQL database. The backend never queries the indexer's database directly — it reads on-chain data via the indexer's HTTP REST API.

## Service Ownership

| Service | Migration Path | Owns Tables |
|---|---|---|
| **tikka-backend** | `backend/database/migrations/` | 9 tables (off-chain metadata, auth, notifications, webhooks) |
| **tikka-indexer** | `indexer/src/database/migrations/` | 10 tables (on-chain raffle state, events, users) |
| **tikka-oracle** | `oracle/database/migrations/` | 4 tables (VRF audit, draw idempotency, push failures) |

## Quick Reference

| Table | Owner | DB Instance | Public Read |
|---|---|---|---|
| `raffle_metadata` | backend | Supabase | Yes (non-deleted rows) |
| `notifications` | backend | Supabase | No |
| `oracle_jobs` | backend | Supabase | No |
| `push_tokens` | backend | Supabase | No |
| `refresh_tokens` | backend | Supabase | No |
| `siws_nonces` | backend | Supabase | No |
| `webhooks` (public) | backend | Supabase | Self-serve (JWT) |
| `webhook_deliveries` | backend | Supabase | Self-serve (JWT) |
| `notification_subscriptions` | backend | Supabase | No |
| `audit_logs` | backend | Supabase | No |
| `raffles` | indexer | Indexer PG | Via indexer API |
| `tickets` | indexer | Indexer PG | Via indexer API |
| `users` | indexer | Indexer PG | Via indexer API |
| `raffle_events` | indexer | Indexer PG | No |
| `platform_stats` | indexer | Indexer PG | Via indexer API |
| `platform_state` | indexer | Indexer PG | No |
| `indexer_cursor` | indexer | Indexer PG | No |
| `webhooks` (internal) | indexer | Indexer PG | No |
| `dead_letter_events` | indexer | Indexer PG | No |
| `archive_checkpoints` | indexer | Indexer PG | No |
| `vrf_audit_log` | oracle | Supabase | Yes |
| `oracle_draw_requests` | oracle | Supabase | No |
| `oracle_draw_request_replays` | oracle | Supabase | No |
| `push_delivery_failures` | oracle* | Supabase | No |

\* `push_delivery_failures` migration lives in `oracle/database/migrations/` but is **written by backend** `PushNotificationService`. Oracle defined the schema; backend is the writer.

## Cross-Service Reads

The following cross-service read patterns exist:

| Table | Written By | Read By | Method |
|---|---|---|---|
| `oracle_jobs` | *(no writer found)* | Backend MonitorService | Direct Supabase query |
| `push_delivery_failures` | Backend PushNotificationService | Operators (manual) | Direct Supabase query |
| `raffles`, `tickets`, `users`, etc. | Indexer | Backend | HTTP API to indexer (not direct DB) |

## Adding New Columns

1. **Identify which service owns the table** from the tables above.
2. **Add a migration** in the owner's migration directory:
   - Backend: `backend/database/migrations/<NNN>_<name>.sql`
   - Indexer: `indexer/src/database/migrations/<timestamp>-<Name>.ts`
   - Oracle: `oracle/database/migrations/<name>.sql`
3. **If adding a cross-service read**, document the read pattern here.
