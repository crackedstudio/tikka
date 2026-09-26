# Oracle Environment

Source: `oracle/src/config/config.loader.ts`, `config.schema.ts`, and
`config.verify.ts`. Oracle configuration is grouped below by purpose.

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `3003` | HTTP listen port. |
| `NODE_ENV` | No | `development` | Runtime environment. |
| `HORIZON_URL` | No | `https://horizon-testnet.stellar.org` | Stellar Horizon endpoint. |
| `SOROBAN_RPC_URL` | No | `https://soroban-testnet.stellar.org` | Soroban RPC endpoint. |
| `SOROBAN_RPC_FALLBACK_URLS` | No | Empty | Comma-separated fallback Soroban RPC URLs. |
| `NETWORK_PASSPHRASE` | No | Testnet passphrase | Stellar network passphrase. |
| `RAFFLE_CONTRACT_ID` | Yes | None | Deployed raffle contract ID. |
| `KEY_PROVIDER` | No | `env` | Key provider: `env`, `aws-kms`, or `gcp-kms` (aliases accepted). |
| `ORACLE_SECRET_KEY` | Conditional | None | Secret key for `KEY_PROVIDER=env`; preferred env-key variable. Secret. |
| `ORACLE_PRIVATE_KEY` | Conditional | None | Alternative env-key variable. Secret. |
| `AWS_REGION` | Conditional | None | AWS region for `aws-kms`. |
| `AWS_KMS_KEY_ID` | Conditional | None | KMS key ID for `aws-kms`. |
| `GCP_PROJECT_ID` | Conditional | None | Project for `gcp-kms`. |
| `GCP_LOCATION_ID` | No | `global` | KMS location for `gcp-kms`. |
| `GCP_KEY_RING_ID` | Conditional | None | KMS key ring for `gcp-kms`. |
| `GCP_KEY_ID` | Conditional | None | KMS key for `gcp-kms`. |
| `GCP_KEY_VERSION` | No | `1` | KMS key version for `gcp-kms`. |
| `REDIS_HOST` | No | `localhost` | Queue Redis host. |
| `REDIS_PORT` | No | `6379` | Queue Redis port. |
| `QUEUE_MAX_RETRIES` | No | `3` | Queue job retry count. |
| `QUEUE_INITIAL_BACKOFF_MS` | No | `2000` | Initial queue retry delay. |
| `QUEUE_BACKOFF_MULTIPLIER` | No | `2` | Exponential retry multiplier. |
| `QUEUE_MAX_BACKOFF_MS` | No | `60000` | Maximum queue retry delay. |
| `QUEUE_CONFIRMATION_TIMEOUT_MS` | No | `300000` | Transaction confirmation timeout. |
| `QUEUE_MAX_CONCURRENCY` | No | `5` | Maximum concurrent queue jobs. |
| `QUEUE_GENERATION_TIMEOUT_MS` | No | `30000` | Randomness generation timeout. |
| `QUEUE_SUBMISSION_TIMEOUT_MS` | No | `120000` | Transaction submission timeout. |
| `VRF_THRESHOLD_XLM` | No | `500` | Prize threshold for VRF, in XLM. |
| `ORACLE_CB_FAILURE_THRESHOLD` | No | `5` | Failures before circuit breaker opens. |
| `ORACLE_CB_RESET_TIMEOUT_MS` | No | `60000` | Circuit-breaker reset timeout. |
| `ORACLE_HIGH_VALUE_THRESHOLD_XLM` | No | `10000` | High-priority prize threshold. |
| `ORACLE_MED_VALUE_THRESHOLD_XLM` | No | `1000` | Medium-priority threshold; must be below high threshold. |
| `ORACLE_MAX_FEE_STROOPS` | No | `100000000` | Maximum transaction fee in stroops. |
| `ORACLE_MIN_FEE_STROOPS` | No | `100` | Minimum transaction fee in stroops. |
| `LOW_STAKES_THRESHOLD_XLM` | No | `500` | Low-stakes threshold in XLM. |
| `TX_SUBMIT_MAX_ATTEMPTS` | No | `5` | Transaction submission attempts. |
| `TX_SUBMIT_INITIAL_BACKOFF_MS` | No | `1000` | Initial transaction retry delay. |
| `TX_SUBMIT_ALERT_WEBHOOK_URL` | No | None | Webhook for submission alerts. |
| `ORACLE_MODE` | No | `single` | Oracle coordination mode: `single` or `multi`. |
| `MULTI_ORACLE_ENABLED` | No | `false` | Enable multi-oracle operation. |
| `LOCAL_ORACLE_ID` | No | None | This oracle's ID in multi-oracle mode. |
| `ORACLE_REGISTRY` | No | None | Multi-oracle registry configuration. |
| `ORACLE_PEERS` | No | None | Multi-oracle peer configuration. |
| `ORACLE_SECRETS` | No | None | Multi-oracle shared secrets. Secret. |
| `MULTI_ORACLE_THRESHOLD` | No | None | Required multi-oracle quorum. |
| `ORACLE_MULTI_TIMEOUT_MS` | No | `10000` | Multi-oracle request timeout. |
| `SUPABASE_URL` | Conditional | Disabled when unset | Enables Supabase integration. |
| `SUPABASE_SERVICE_ROLE_KEY` | Conditional | Falls back to `SUPABASE_ANON_KEY` | Supabase service key. Secret. |
| `SUPABASE_ANON_KEY` | No | None | Supabase anon key and service-key fallback. |
| `ALERTING_PROVIDER` | No | `none` | Alert provider: `none`, `pagerduty`, or `opsgenie`. |
| `PAGERDUTY_ROUTING_KEY` | Conditional | None | Required when provider is `pagerduty`. Secret. |
| `OPSGENIE_API_KEY` | Conditional | None | Required when provider is `opsgenie`. Secret. |
| `ALERT_WEBHOOK_URL` | No | None | Generic alert webhook URL. |
| `HEARTBEAT_INTERVAL_MS` | No | `3600000` | Heartbeat period. |
| `HEARTBEAT_ALERT_TIMEOUT_MS` | No | `90000` | Heartbeat alert timeout. |
| `EVENT_LISTENER_INITIAL_RETRY_DELAY` | No | `1000` | Initial event-listener retry delay. |
| `EVENT_LISTENER_MAX_RETRY_DELAY` | No | `60000` | Maximum event-listener retry delay. |
| `ORACLE_DRAW_REQUEST_REPLAY` | No | `false` | Replay draw requests for development/testing. |
| `LOG_LEVEL` | No | `info` | Logging level. |
| `LOG_DIR` | No | `./logs` | Log output directory. |
| `LOG_TO_CONSOLE` | No | `true` | Enable console logging. |
| `LOG_MAX_SIZE` | No | `20m` | Maximum size per log file. |
| `LOG_MAX_FILES` | No | `14d` | Log retention limit. |
| `LOG_ZIPPED_ARCHIVE` | No | `true` | Compress rotated logs. |
| `ORACLE_KEY_CREATED_AT` | No (warning) | None | ISO-8601 key creation/rotation date for key-age checks. |
| `ORACLE_KEY_MAX_AGE_DAYS` | No | `90` | Maximum key age used by verification. |