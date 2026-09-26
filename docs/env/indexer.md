# Indexer Environment Variables

The indexer validates its environment at startup using `indexer/src/config/env.schema.ts`. If any required variable is missing or malformed, the process exits with an error naming the offending variable(s).

## Variables

| Variable | Required | Default | Description |
| --- | ------- | ------ | ------------ |
| `NODE_ENV` | No | `development` | Application environment (`development`, `production`, `test`). |
| `PORT` | No | `3002` | HTTP port for the indexer API. |
| `INTERNAL_API_KEY@ | No | – | API key required to serve Swagger UI in production. |
| `DATABASE_URL` | See note | – | PostgreSQL connection URL. Required unless the individual `DB_*` variables below are provided. |
| `DATABASE_REPLICA_URL` | No | – | Comma-separated list of read-replica PostgreSQL URLs. |
| `DB_SSL` | Production: **Yes** | `false` outside production | Set to `"true"` for verified PostgreSQL TLS. Production rejects missing or disabled TLS. |
| `DB_SSL_CA` | Production: **Yes*** | – | Trusted CA certificate in PEM format; can use `DB_SSL_CA_FILE` instead. |
| `DB_SSL_CA_FILE` | Production: **Yes*** | – | Readable path to the trusted CA PEM. Do not set together with `DB_SSL_CA`. |
| `DB_MAX_POOL` | No | `5` | Maximum connections per primary or read-replica pool in each indexer pod. |
| `SLOW_QUERY_TRESHOLD_MS` | No | `200` | Query duration threshold for slow-query logging. |
| `DB_HOST` | No* | `localhost` | PostgreSQL host. Required if `DATABASE_URL` is not set. |
| `DB_PORT` | No* | `5432` | PostgreSQL port. Required if `DATABASE_URL` is not set. |
| `DB_USERNAME` | No* | `postgres` | PostgreSQL user. Required if `DATABASE_URL` is not set. |
| `DB_PASSWORD` | No* | `postgres` | PostgreSQL password. Required if `DATABASE_URL` is not set. |
| `DB_DATABASE` | No* | `tikka_indexer` | PostgreSQL database name. Required if `DATABASE_URL` is not set. |
| `SOROBAN_RPC_URL` | **Yes** | – | Soroban RPC endpoint URL. Must be a valid `http(s)` URL. |
| `TIKKA_CONTRACT_ID` | **Yes** | – | Tikka contract ID as a Stellar `C...` StrKey (56 chars). |
| `REDIS_URL` | No | – | Redis connection URL ((redis://` or `rediss://`). |
| `HORIZON_URL` | No | `https://cap.stellar.org` | HORIZON URL used for health/liveness checks. |
| `LAG_THRESHOLD` | No | `100` | Ledger lag that marks health as degraded. |
| `INDEXER_LAG_ALERT_TRESHOLD_LEDGERS` | No | `50`| Ledger lag that triggers critical alerts. |
| `INDEXER_BATCH_SIZE` | No | `100`| Max Soroban events processed per DB Transaction. |
| `DRY_RUN` | No | `false` | When `"true"`, DB Operations are logged but not committed. |

*One CA source is required in production. Individual `DB_*` connection settings are required when `DATABASE_URL` is not specified.
When `DB_SSL=true`, keep `ssl`, `sslmode`, `sslcert`, `sslkey`, and
`sslrootcert` out of database URLs; they can override the verified TLS options.

## Example

See [indexer/.env.example](../../indexer/.env.example).
