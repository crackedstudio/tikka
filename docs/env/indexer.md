# Indexer Environment

Source: `indexer/src/config/env.schema.ts`, `database.config.ts`, and runtime
modules that read `process.env` directly.

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | Runtime environment. |
| `PORT` | No | `3002` | HTTP port. |
| `INTERNAL_API_KEY` | Conditional | None | Required to expose Swagger UI in production. Secret. |
| `DATABASE_URL` | Conditional | None | PostgreSQL URL; use this or all `DB_*` connection fields. Secret. |
| `DATABASE_REPLICA_URL` | No | None | Comma-separated PostgreSQL read-replica URLs. |
| `DB_HOST` | Conditional | `localhost` | PostgreSQL host when `DATABASE_URL` is unset. |
| `DB_PORT` | Conditional | `5432` | PostgreSQL port when using individual fields. |
| `DB_USERNAME` | Conditional | `postgres` | PostgreSQL user when using individual fields. |
| `DB_PASSWORD` | Conditional | `postgres` | PostgreSQL password when using individual fields. Secret. |
| `DB_DATABASE` | Conditional | `tikka_indexer` | Database name when using individual fields. |
| `DB_SSL` | No | `false` | Set `true` to enable TLS with managed PostgreSQL. |
| `SOROBAN_RPC_URL` | Yes | None | Soroban RPC endpoint. |
| `TIKKA_CONTRACT_ID` | Yes | None | Tikka contract StrKey (`C...`). |
| `REDIS_URL` | No | None | Redis URL for queue/cache connections. Secret if credentials are embedded. |
| `REDIS_HOST` | No | `localhost` | Redis hostname when configuring Redis by fields. |
| `REDIS_PORT` | No | `6379` | Redis port. |
| `REDIS_PASSWORD` | No | None | Redis password. Secret. |
| `REDIS_DB` | No | `0` | Redis database number. |
| `HORIZON_URL` | No | `https://horizon.stellar.org` | Horizon endpoint used for health checks. |
| `LAG_THRESHOLD` | No | `100` | Ledger lag before health is degraded. |
| `INDEXER_LAG_ALERT_THRESHOLD_LEDGERS` | No | `50` | Ledger lag before critical alerts. |
| `INDEXER_BATCH_SIZE` | No | `100` | Soroban events processed per database transaction. |
| `SLOW_QUERY_THRESHOLD_MS` | No | `200` | Slow query logging threshold in milliseconds. |
| `MAX_DISPATCH_RETRIES` | No | `3` | Maximum dispatch retry attempts. |
| `BASE_RETRY_DELAY_MS` | No | `500` | Initial delay between dispatch retries. |
| `SHUTDOWN_TIMEOUT_MS` | No | `15000` | Graceful shutdown timeout. |
| `OTEL_SERVICE_NAME` | No | `tikka-indexer` | OpenTelemetry service name. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | None | OTLP traces exporter endpoint. |
| `OTEL_TRACES_CONSOLE` | No | `false` | Also emit traces to the console. |

| `DRY_RUN` | No | `false` for ingestion; `true` for archive CLI | Simulate operations. The archive command is destructive only when explicitly set to `false`. |
| `RAFFLE_EVENTS_RETENTION_DAYS` | No | Archive default | Retention period for the archive CLI. |
| `BATCH_SIZE` | No | Archive default | Rows processed per archive batch. |
| `MAX_BATCH` | No | Unlimited | Maximum archive batches per run. |
| `RESUME` | No | `true` | Resume archive from its checkpoint; literal `false` disables resume. |
| `CONFIRM_DELETE` | Conditional | None | Must be `yes` for destructive archive runs. |

`DATABASE_URL` is preferred. Startup validation requires it or the complete
`DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, and `DB_DATABASE` set. Test
only: `RUN_DOCKER_INTEGRATION=1` enables Docker-backed integration tests.
`DRY_RUN` is read by runtime modules and allowed through Joi's unknown-variable
pass-through, even though it is not listed in the startup schema.
