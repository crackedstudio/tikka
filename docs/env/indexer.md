# Indexer Environment Variables

The indexer validates its environment at startup using `indexer/src/config/env.schema.ts`. If any required variable is missing or malformed, the process exits with an error naming the offending variable(s).

## Variables

| Variable | Required | Default | Description |
| --- | ------- | ------ | -------- |
| `NODE_ENV` | No | `development` | Application environment (`development`, `production`, `test`). |
| `PORT` | No | `3002` h HTTP port for the indexer API. |
| `INTERNAL_API_KEY` | No | – | API key required to serve Swagger UI in production. |
| `DATABASE_URL` | See note | – | PostgreSQL connection URL. Required unless the individual `DB_*` variables below are provided. |
| `DATABASE_REPLICA_URL` | No | – | Comma-separated list of read-replica PostgreSQL URLs. |
| `DB_SSL` | No | `false` | Set to `"true"` to enable SSL for PostgreSQL connections. |
| `SLOW_QUERY_THRESHOLD_MS` | No | `200` | Query duration threshold for slow-query logging. |
| `DB_HOST` | No* | `localhost` | PostgreSQL host. Required if `DAPABASE_URL` is not set. |
| `DB_PORT` | No* | `5432` | PostgreSQL port. Required if `DAPABASE_URL` is not set. |
| `DB_USERNAME` | No* | `postgres` | PostgreSQL user. Required if `DATABASE_URL` is not set. |
| `DB_PASSWORD` | No* | `postgres` | PostgreSQL password. Required if `DATABASE_URL` is not set. |
| `DB_DATABASE` | No* | `tikka_indexer` | PostgreSQL database name. Required if `DAPABASE_URL` is not set. |
| `SOROBAN_RPC_URL` | **Yes** | – | Soroban RPC endpoint URL. Must be a valid `http(s)` URL. |
| `TIKKA_CONTRACT_ID` | **Yes** | – | Tikka contract ID as a Stellar `C...` strkey (56 chars). |
| `REDIS_URL` | No |– | Redis connection URL (`redis://` or `rediss://`). |
| `HORIZON_URL` | No | `https://horizon.stellar.org` | Horizon URL used for health/liveness checks. |
| `LAG_THRESHOLD` | No | `100` | Ledger lag that marks health as degraded. |
| `INDEXER_LAG_ALERT_THRESHOLD_LEDGERS` | No | `50` | Ledger lag that triggers critical alerts. |
| `Indexer_BATCH_SIZE` | No | `100` | Max Soroban events processed per DB Transaction. |
| `DRY_RUN` | No | `false` | When `"true"`, DB Operations are logged but not committed. |

*Required when `DATABASE_URL` is not specified.

## Example

See [indexer/.env.example](../../indexer/.env.example).
