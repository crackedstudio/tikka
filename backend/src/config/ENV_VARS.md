# Backend Environment Variables

This document lists every environment variable read by the backend, grouped by
config module. **Required** variables have no default — the app will fail at
startup with a clear Zod validation error if they are missing or malformed.

> **Single source of truth**: `backend/src/config/env.schema.ts` (Zod schema)
> and `backend/src/config/env.config.ts` (runtime access).

---

## Server

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3001` | HTTP listen port |
| `MAINTENANCE_MODE` | No | `false` | Enable maintenance-mode guard |
| `NODE_ENV` | No | `development` | Node environment (`development`, `production`, `test`) |
| `SWAGGER_ENABLED` | No | `false` | Show Swagger UI even in production |

## Supabase (Database / Storage)

| Variable | Required | Default | Description |
|---|---|---|---|
| `SUPABASE_URL` | **Yes** | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | — | Service-role key for server-side Supabase calls |

## Stellar

| Variable | Required | Default | Description |
|---|---|---|---|
| `STELLAR_NETWORK` | No | `testnet` | `testnet` or `mainnet` |
| `STELLAR_HORIZON_URL` | No | Network default | Override the Horizon RPC URL |
| `STELLAR_CONTRACT_ID` | No | Network default | Override the on-chain contract address |

## Indexer

| Variable | Required | Default | Description |
|---|---|---|---|
| `INDEXER_URL` | Auto | Network default | Base URL of the indexer service (auto-filled from `STELLAR_NETWORK` if empty) |
| `INDEXER_TIMEOUT_MS` | No | `5000` | HTTP timeout for indexer calls (ms) |

## Redis

| Variable | Required | Default | Description |
|---|---|---|---|
| `REDIS_URL` | **Yes** | — | Redis connection URL (used for idempotency keys and metadata cache) |
| `METADATA_CACHE_TTL_SECONDS` | No | `3600` | TTL for metadata cache entries |

## Auth (JWT + SIWS)

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | **Yes** | — | ≥ 32 character signing secret |
| `JWT_EXPIRES_IN` | No | `7d` | Access-token lifetime (e.g. `1h`, `7d`) |
| `JWT_REFRESH_EXPIRES_IN` | No | `30d` | Refresh-token lifetime |
| `SIWS_DOMAIN` | No | `tikka.io` | Sign-In With Stellar domain |
| `SIWS_NONCE_TTL_SECONDS` | No | `300` | Nonce validity window (seconds) |

## Admin

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADMIN_TOKEN` | **Yes** | — | Bearer token for admin/monitoring endpoints |
| `ADMIN_IP_ALLOWLIST` | No | `""` | Comma-separated CIDR ranges for admin access |

## Frontend

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_FRONTEND_URL` | **Yes** | — | Frontend origin (used for CORS) |

## Push Notifications (FCM)

| Variable | Required | Default | Description |
|---|---|---|---|
| `FCM_ENABLED` | No | `false` | Enable Firebase Cloud Messaging |
| `FCM_SERVICE_ACCOUNT_JSON` | No | — | Inline JSON service account credentials |
| `FCM_SERVICE_ACCOUNT_PATH` | No | — | File path to service account JSON |

## IPFS / Pinata (Storage)

| Variable | Required | Default | Description |
|---|---|---|---|
| `ENABLE_IPFS_PINNING` | No | `false` | Enable metadata pinning to IPFS |
| `PINATA_JWT` | No | — | Pinata JWT (preferred auth) |
| `PINATA_API_KEY` | No | — | Pinata API key (legacy auth) |
| `PINATA_API_SECRET` | No | — | Pinata API secret (legacy auth) |
| `IPFS_GATEWAY_URL` | No | `https://ipfs.io/ipfs/` | IPFS gateway base URL for redirects |

## Geolocation

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEO_PROVIDER_URL` | No | `http://ip-api.com/json` | IP geolocation provider URL |
| `GEO_TIMEOUT_MS` | No | `3000` | Geo lookup timeout (ms) |
| `BLOCKED_COUNTRIES` | No | `""` | Comma-separated ISO 3166-1 alpha-2 codes to block; `*` allows all |

## Rate Limiting

| Variable | Required | Default | Description |
|---|---|---|---|
| `THROTTLE_DEFAULT_LIMIT` | No | `100` | Default requests per window |
| `THROTTLE_DEFAULT_TTL` | No | `60` | Default window (seconds) |
| `THROTTLE_AUTH_LIMIT` | No | `10` | Auth endpoint limit |
| `THROTTLE_AUTH_TTL` | No | `60` | Auth endpoint window (seconds) |
| `THROTTLE_NONCE_LIMIT` | No | `30` | Nonce endpoint limit |
| `THROTTLE_NONCE_TTL` | No | `60` | Nonce endpoint window (seconds) |
| `RAFFLE_CREATE_RATE_LIMIT` | No | `5` | Raffle creation limit |
| `RAFFLE_CREATE_RATE_WINDOW_SECONDS` | No | `600` | Raffle creation window (seconds) |

## Backfill

| Variable | Required | Default | Description |
|---|---|---|---|
| `BACKFILL_MAX_RANGE` | No | `10000` | Maximum ledger range per backfill job |
| `BACKFILL_RETRY_COUNT` | No | `3` | Retries per failed ledger fetch |
| `BACKFILL_RETRY_DELAY_MS` | No | `1000` | Delay between retries (ms) |
| `BACKFILL_HORIZON_TIMEOUT_MS` | No | `10000` | Horizon HTTP timeout for backfill (ms) |

## Sentry (Observability)

| Variable | Required | Default | Description |
|---|---|---|---|
| `SENTRY_DSN` | No | — | Sentry DSN; omit to disable |
| `SENTRY_TRACES_SAMPLE_RATE` | No | `0.1` | Transaction sample rate (0–1) |

## Logging

| Variable | Required | Default | Description |
|---|---|---|---|
| `LOG_REDACT_FIELDS` | No | Built-in list | Comma-separated header/body field names to redact from request logs |
