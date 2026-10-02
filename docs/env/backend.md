# Backend Environment

Source: `backend/src/config/env.schema.ts` and `backend/src/config/env.config.ts`.
The schema is authoritative for startup requirements and defaults. The final
section also records variables used by backend operational scripts.

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `3001` | HTTP listen port. |
| `MAINTENANCE_MODE` | No | `false` | Enable the maintenance-mode guard. |
| `NODE_ENV` | No | `development` | Runtime environment. |
| `SWAGGER_ENABLED` | No | `false` | Enable Swagger UI in production. |
| `SUPABASE_URL` | Yes | None | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | None | Server-side Supabase service-role key. Secret. |
| `STELLAR_NETWORK` | No | `testnet` | Stellar network; selects network-dependent defaults. |
| `STELLAR_HORIZON_URL` | No | Network default | Override the Horizon endpoint. |
| `STELLAR_CONTRACT_ID` | No | Network default | Override the deployed contract ID. |
| `INDEXER_URL` | No | Network default | Indexer base URL; derived when unset or empty. |
| `INDEXER_TIMEOUT_MS` | No | `5000` | Indexer request timeout in milliseconds. |
| `BACKFILL_MAX_RANGE` | No | `10000` | Maximum ledger range per backfill. |
| `BACKFILL_RETRY_COUNT` | No | `3` | Retries per failed ledger fetch. |
| `BACKFILL_RETRY_DELAY_MS` | No | `1000` | Delay between backfill retries. |
| `BACKFILL_HORIZON_TIMEOUT_MS` | No | `10000` | Horizon request timeout for backfill. |
| `REDIS_URL` | No | Empty (disabled) | Redis URL for idempotency/cache; empty disables cache-aside. |
| `JWT_SECRET` | Yes | None | JWT signing secret, at least 32 characters. Secret. |
| `JWT_EXPIRES_IN` | No | `7d` | Access-token lifetime. |
| `JWT_REFRESH_EXPIRES_IN` | No | `30d` | Refresh-token lifetime (legacy auth getter). |
| `SIWS_DOMAIN` | No | `tikka.io` | Domain included in Sign-In With Stellar messages. |
| `SIWS_NONCE_TTL_SECONDS` | No | `300` | SIWS nonce validity window. |
| `VITE_FRONTEND_URL` | Yes | None | Comma-separated frontend origins allowed by CORS. |
| `VITE_FRONTEND_URL_REGEX` | No | None | Optional frontend origin regex. |
| `ADMIN_TOKEN` | Yes | None | Bearer token for admin and monitoring endpoints. Secret. |
| `ADMIN_IP_ALLOWLIST` | No | Empty | Comma-separated CIDRs/IPs; empty disables IP filtering. |
| `FCM_ENABLED` | No | `false` | Enable Firebase Cloud Messaging. |
| `FCM_SERVICE_ACCOUNT_JSON` | No | None | Inline Firebase service-account JSON. Secret. |
| `FCM_SERVICE_ACCOUNT_PATH` | No | None | Path to Firebase service-account JSON. |
| `GEO_PROVIDER_URL` | No | `http://ip-api.com/json` | IP geolocation provider endpoint. |
| `GEO_TIMEOUT_MS` | No | `3000` | Geolocation request timeout. |
| `BLOCKED_COUNTRIES` | No | Empty | Comma-separated ISO country codes to block. |
| `SENTRY_DSN` | No | None | Sentry DSN; omitted disables Sentry. |
| `SENTRY_TRACES_SAMPLE_RATE` | No | `0.1` | Sentry trace sample rate from 0 to 1. |
| `THROTTLE_DEFAULT_LIMIT` | No | `100` | Default requests per throttling window. |
| `THROTTLE_DEFAULT_TTL` | No | `60` | Default throttling window in seconds. |
| `THROTTLE_AUTH_LIMIT` | No | `5` | Auth requests per window. |
| `THROTTLE_AUTH_TTL` | No | `900` | Auth throttling window in seconds. |
| `THROTTLE_NONCE_LIMIT` | No | `10` | Nonce requests per window. |
| `THROTTLE_NONCE_TTL` | No | `60` | Nonce throttling window in seconds. |
| `ENABLE_IPFS_PINNING` | No | `false` | Enable Pinata/IPFS metadata pinning. |
| `PINATA_JWT` | No | None | Preferred Pinata credential. Secret. |
| `PINATA_API_KEY` | No | None | Legacy Pinata API key. Secret. |
| `PINATA_API_SECRET` | No | None | Legacy Pinata API secret. Secret. |
| `IPFS_GATEWAY_URL` | No | `https://ipfs.io/ipfs/` | IPFS gateway base URL. |
| `METADATA_CACHE_TTL_SECONDS` | No | `300` | Metadata cache TTL in seconds (schema default). |
| `RAFFLE_CREATE_RATE_LIMIT` | No | `5` | Raffle creations per wallet per window. |
| `RAFFLE_CREATE_RATE_WINDOW_SECONDS` | No | `600` | Raffle creation window in seconds. |
| `FEATURE_RAFFLE_TICKET_PURCHASE` | No | `false` | Feature flag for ticket purchases. |
| `LOG_REDACT_FIELDS` | No | Built-in list | Comma-separated fields redacted from request logs. |
| `SITE_URL` | No | Falls back to `VITE_FRONTEND_URL` | Public site URL used by backend metadata/OG output. |
| `SUPABASE_DB_URL` | Conditional | None | Database URI required by `backend/scripts/backup.sh`. Secret. |
| `R2_BUCKET_NAME` | No | Unset (upload disabled) | R2 bucket used by the backup script. |
| `R2_ACCESS_KEY_ID` | Conditional | None | R2 access key required when `R2_BUCKET_NAME` is set. Secret. |
| `R2_SECRET_ACCESS_KEY` | Conditional | None | R2 secret required when `R2_BUCKET_NAME` is set. Secret. |
| `R2_ENDPOINT_URL` | Conditional | None | R2 endpoint required when `R2_BUCKET_NAME` is set. |