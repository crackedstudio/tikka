# Oracle Environment Variables

This document describes all environment variables used by the Tikka Oracle service.

## Table of Contents

- [Server Configuration](#server-configuration)
- [Stellar Network Configuration](#stellar-network-configuration)
- [Key Provider Configuration](#key-provider-configuration)
- [Queue Configuration](#queue-configuration)
- [VRF Configuration](#vrf-configuration)
- [Circuit Breaker Configuration](#circuit-breaker-configuration)
- [Priority Queue Configuration](#priority-queue-configuration)
- [Fee Configuration](#fee-configuration)
- [Transaction Submission Configuration](#transaction-submission-configuration)
- [Multi-Oracle Configuration](#multi-oracle-configuration)
- [Supabase Configuration](#supabase-configuration)
- [Alerting Configuration](#alerting-configuration)
- [Heartbeat Configuration](#heartbeat-configuration)
- [Event Listener Configuration](#event-listener-configuration)
- [Logging Configuration](#logging-configuration)

---

## Server Configuration

### `PORT`
- **Type**: Integer
- **Default**: `3003`
- **Description**: HTTP server port for the oracle service
- **Example**: `PORT=3003`

### `NODE_ENV`
- **Type**: String (enum: `development`, `production`, `test`)
- **Default**: `development`
- **Description**: Node.js environment mode
- **Example**: `NODE_ENV=production`

---

## Stellar Network Configuration

### `HORIZON_URL`
- **Type**: URL
- **Default**: `https://horizon-testnet.stellar.org`
- **Required**: No
- **Description**: Stellar Horizon API endpoint for event streaming
- **Example**: `HORIZON_URL=https://horizon.stellar.org`

### `SOROBAN_RPC_URL`
- **Type**: URL
- **Default**: `https://soroban-testnet.stellar.org`
- **Required**: No
- **Description**: Primary Soroban RPC endpoint for contract interactions
- **Example**: `SOROBAN_RPC_URL=https://soroban.stellar.org`

### `SOROBAN_RPC_FALLBACK_URLS`
- **Type**: Comma-separated URLs
- **Default**: `[]` (empty)
- **Required**: No
- **Description**: Fallback Soroban RPC endpoints for automatic failover
- **Example**: `SOROBAN_RPC_FALLBACK_URLS=https://rpc1.example.com,https://rpc2.example.com`

### `NETWORK_PASSPHRASE`
- **Type**: String
- **Default**: `Test SDF Network ; September 2015`
- **Required**: Yes
- **Description**: Stellar network passphrase for transaction signing
- **Example**: `NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015`

### `RAFFLE_CONTRACT_ID`
- **Type**: String (Contract Address)
- **Default**: None
- **Required**: **Yes**
- **Description**: Stellar contract ID for the raffle smart contract
- **Example**: `RAFFLE_CONTRACT_ID=CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM`

---

## Key Provider Configuration

### `KEY_PROVIDER`
- **Type**: String (enum: `env`, `aws-kms`, `gcp-kms`)
- **Default**: `env`
- **Required**: No
- **Description**: Key management provider type
- **Example**: `KEY_PROVIDER=aws-kms`

### Environment Key Provider (`KEY_PROVIDER=env`)

#### `ORACLE_SECRET_KEY` or `ORACLE_PRIVATE_KEY`
- **Type**: String (Stellar Secret Key)
- **Default**: None
- **Required**: **Yes** (when `KEY_PROVIDER=env`)
- **Description**: Oracle's Ed25519 private key for signing
- **Example**: `ORACLE_SECRET_KEY=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`
- **Security**: ⚠️ **Never commit this to version control**

### AWS KMS Provider (`KEY_PROVIDER=aws-kms`)

#### `AWS_REGION`
- **Type**: String
- **Default**: None
- **Required**: **Yes** (when `KEY_PROVIDER=aws-kms`)
- **Description**: AWS region where the KMS key is located
- **Example**: `AWS_REGION=us-east-1`

#### `AWS_KMS_KEY_ID`
- **Type**: String (ARN or Key ID)
- **Default**: None
- **Required**: **Yes** (when `KEY_PROVIDER=aws-kms`)
- **Description**: AWS KMS key identifier
- **Example**: `AWS_KMS_KEY_ID=arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012`

### GCP KMS Provider (`KEY_PROVIDER=gcp-kms`)

#### `GCP_PROJECT_ID`
- **Type**: String
- **Default**: None
- **Required**: **Yes** (when `KEY_PROVIDER=gcp-kms`)
- **Description**: Google Cloud project ID
- **Example**: `GCP_PROJECT_ID=my-project-123`

#### `GCP_LOCATION_ID`
- **Type**: String
- **Default**: `global`
- **Required**: No
- **Description**: GCP location for the key ring
- **Example**: `GCP_LOCATION_ID=us-east1`

#### `GCP_KEY_RING_ID`
- **Type**: String
- **Default**: None
- **Required**: **Yes** (when `KEY_PROVIDER=gcp-kms`)
- **Description**: GCP KMS key ring identifier
- **Example**: `GCP_KEY_RING_ID=oracle-keyring`

#### `GCP_KEY_ID`
- **Type**: String
- **Default**: None
- **Required**: **Yes** (when `KEY_PROVIDER=gcp-kms`)
- **Description**: GCP KMS key identifier
- **Example**: `GCP_KEY_ID=oracle-key`

#### `GCP_KEY_VERSION`
- **Type**: String
- **Default**: `1`
- **Required**: No
- **Description**: GCP KMS key version
- **Example**: `GCP_KEY_VERSION=1`

---

## Queue Configuration

### `REDIS_HOST`
- **Type**: String
- **Default**: `localhost`
- **Required**: No
- **Description**: Redis server hostname for Bull queue
- **Example**: `REDIS_HOST=redis.example.com`

### `REDIS_PORT`
- **Type**: Integer
- **Default**: `6379`
- **Required**: No
- **Description**: Redis server port
- **Example**: `REDIS_PORT=6380`

### `QUEUE_MAX_RETRIES`
- **Type**: Integer
- **Default**: `3`
- **Required**: No
- **Description**: Maximum retry attempts for failed jobs
- **Example**: `QUEUE_MAX_RETRIES=5`

### `QUEUE_INITIAL_BACKOFF_MS`
- **Type**: Integer (milliseconds)
- **Default**: `2000`
- **Required**: No
- **Description**: Initial backoff delay for job retries
- **Example**: `QUEUE_INITIAL_BACKOFF_MS=1000`

### `QUEUE_BACKOFF_MULTIPLIER`
- **Type**: Float
- **Default**: `2`
- **Required**: No
- **Description**: Backoff multiplier for exponential retry delays
- **Example**: `QUEUE_BACKOFF_MULTIPLIER=1.5`

### `QUEUE_MAX_BACKOFF_MS`
- **Type**: Integer (milliseconds)
- **Default**: `60000`
- **Required**: No
- **Description**: Maximum backoff delay between retries
- **Example**: `QUEUE_MAX_BACKOFF_MS=120000`

### `QUEUE_CONFIRMATION_TIMEOUT_MS`
- **Type**: Integer (milliseconds)
- **Default**: `300000` (5 minutes)
- **Required**: No
- **Description**: Timeout for transaction confirmation
- **Example**: `QUEUE_CONFIRMATION_TIMEOUT_MS=600000`

### `QUEUE_MAX_CONCURRENCY`
- **Type**: Integer
- **Default**: `5`
- **Required**: No
- **Description**: Maximum concurrent job processing
- **Example**: `QUEUE_MAX_CONCURRENCY=10`

### `QUEUE_GENERATION_TIMEOUT_MS`
- **Type**: Integer (milliseconds)
- **Default**: `30000`
- **Required**: No
- **Description**: Timeout for randomness generation
- **Example**: `QUEUE_GENERATION_TIMEOUT_MS=60000`

### `QUEUE_SUBMISSION_TIMEOUT_MS`
- **Type**: Integer (milliseconds)
- **Default**: `120000`
- **Required**: No
- **Description**: Timeout for transaction submission
- **Example**: `QUEUE_SUBMISSION_TIMEOUT_MS=180000`

---

## VRF Configuration

### `VRF_THRESHOLD_XLM`
- **Type**: Float (XLM)
- **Default**: `500`
- **Required**: No
- **Description**: Prize amount threshold for using VRF instead of PRNG
- **Example**: `VRF_THRESHOLD_XLM=1000`
- **Note**: Raffles with prize >= this value use VRF; others use PRNG

---

## Circuit Breaker Configuration

### `ORACLE_CB_FAILURE_THRESHOLD`
- **Type**: Integer
- **Default**: `5`
- **Required**: No
- **Description**: Number of consecutive Horizon SSE failures before circuit opens
- **Example**: `ORACLE_CB_FAILURE_THRESHOLD=10`

### `ORACLE_CB_RESET_TIMEOUT_MS`
- **Type**: Integer (milliseconds)
- **Default**: `60000` (1 minute)
- **Required**: No
- **Description**: Time circuit stays open before allowing probe attempt
- **Example**: `ORACLE_CB_RESET_TIMEOUT_MS=120000`

---

## Priority Queue Configuration

### `ORACLE_HIGH_VALUE_THRESHOLD_XLM`
- **Type**: Float (XLM)
- **Default**: `10000`
- **Required**: No
- **Description**: Minimum prize amount for HIGH priority classification
- **Example**: `ORACLE_HIGH_VALUE_THRESHOLD_XLM=5000`

### `ORACLE_MED_VALUE_THRESHOLD_XLM`
- **Type**: Float (XLM)
- **Default**: `1000`
- **Required**: No
- **Description**: Minimum prize amount for MEDIUM priority classification
- **Example**: `ORACLE_MED_VALUE_THRESHOLD_XLM=500`
- **Constraint**: Must be less than `ORACLE_HIGH_VALUE_THRESHOLD_XLM`

---

## Fee Configuration

### `ORACLE_MAX_FEE_STROOPS`
- **Type**: Integer (stroops)
- **Default**: `100000000` (10 XLM)
- **Required**: No
- **Description**: Maximum fee cap for transactions
- **Example**: `ORACLE_MAX_FEE_STROOPS=50000000`

### `ORACLE_MIN_FEE_STROOPS`
- **Type**: Integer (stroops)
- **Default**: `100`
- **Required**: No
- **Description**: Minimum fee for transactions
- **Example**: `ORACLE_MIN_FEE_STROOPS=200`

### `LOW_STAKES_THRESHOLD_XLM`
- **Type**: Float (XLM)
- **Default**: `500`
- **Required**: No
- **Description**: Threshold for low-stakes fee optimization
- **Example**: `LOW_STAKES_THRESHOLD_XLM=1000`

---

## Transaction Submission Configuration

### `TX_SUBMIT_MAX_ATTEMPTS`
- **Type**: Integer
- **Default**: `5`
- **Required**: No
- **Description**: Maximum transaction submission attempts
- **Example**: `TX_SUBMIT_MAX_ATTEMPTS=3`

### `TX_SUBMIT_INITIAL_BACKOFF_MS`
- **Type**: Integer (milliseconds)
- **Default**: `1000`
- **Required**: No
- **Description**: Initial backoff delay for transaction retries
- **Example**: `TX_SUBMIT_INITIAL_BACKOFF_MS=2000`

### `TX_SUBMIT_ALERT_WEBHOOK_URL`
- **Type**: URL
- **Default**: None
- **Required**: No
- **Description**: Webhook URL for transaction submission alerts
- **Example**: `TX_SUBMIT_ALERT_WEBHOOK_URL=https://hooks.slack.com/services/XXX/YYY/ZZZ`

---

## Multi-Oracle Configuration

### `ORACLE_MODE`
- **Type**: String (enum: `single`, `multi`)
- **Default**: `single`
- **Required**: No
- **Description**: Oracle operation mode
- **Example**: `ORACLE_MODE=multi`

### `MULTI_ORACLE_ENABLED`
- **Type**: Boolean
- **Default**: `false`
- **Required**: No
- **Description**: Legacy flag to enable multi-oracle mode
- **Example**: `MULTI_ORACLE_ENABLED=true`

### `LOCAL_ORACLE_ID`
- **Type**: String
- **Default**: None
- **Required**: No (required when `ORACLE_MODE=multi`)
- **Description**: Identifier for this oracle instance
- **Example**: `LOCAL_ORACLE_ID=oracle-1`

### `ORACLE_REGISTRY`
- **Type**: String (comma-separated)
- **Default**: None
- **Required**: No
- **Description**: Registry of all oracle configurations
- **Example**: `ORACLE_REGISTRY=oracle-1:url1:pubkey1,oracle-2:url2:pubkey2`

### `ORACLE_PEERS`
- **Type**: String (comma-separated)
- **Default**: None
- **Required**: No
- **Description**: Peer oracle endpoints
- **Example**: `ORACLE_PEERS=oracle-2:url2:pubkey2,oracle-3:url3:pubkey3`

### `ORACLE_SECRETS`
- **Type**: String (comma-separated)
- **Default**: None
- **Required**: No
- **Description**: Private keys for multi-oracle setup
- **Example**: `ORACLE_SECRETS=oracle-1:secret1,oracle-2:secret2`
- **Security**: ⚠️ **Never commit this to version control**

### `MULTI_ORACLE_THRESHOLD`
- **Type**: Integer
- **Default**: `ceil(totalOracles / 2) + 1`
- **Required**: No
- **Description**: Minimum number of oracle signatures required
- **Example**: `MULTI_ORACLE_THRESHOLD=3`

### `ORACLE_MULTI_TIMEOUT_MS`
- **Type**: Integer (milliseconds)
- **Default**: `10000`
- **Required**: No
- **Description**: Timeout for multi-oracle coordination
- **Example**: `ORACLE_MULTI_TIMEOUT_MS=15000`

---

## Supabase Configuration

### `SUPABASE_URL`
- **Type**: URL
- **Default**: None
- **Required**: No (required if using audit logging)
- **Description**: Supabase project URL
- **Example**: `SUPABASE_URL=https://xxxxx.supabase.co`

### `SUPABASE_SERVICE_ROLE_KEY`
- **Type**: String
- **Default**: None
- **Required**: **Yes** (when `SUPABASE_URL` is set)
- **Description**: Supabase service role key for admin access
- **Example**: `SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Security**: ⚠️ **Never commit this to version control**

### `SUPABASE_ANON_KEY`
- **Type**: String
- **Default**: None
- **Required**: No
- **Description**: Supabase anonymous key (fallback)
- **Example**: `SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

---

## Alerting Configuration

### `ALERTING_PROVIDER`
- **Type**: String (enum: `none`, `pagerduty`, `opsgenie`)
- **Default**: `none`
- **Required**: No
- **Description**: Alerting provider for critical incidents
- **Example**: `ALERTING_PROVIDER=pagerduty`

### `PAGERDUTY_ROUTING_KEY`
- **Type**: String
- **Default**: None
- **Required**: **Yes** (when `ALERTING_PROVIDER=pagerduty`)
- **Description**: PagerDuty integration routing key
- **Example**: `PAGERDUTY_ROUTING_KEY=R0XXXXXXXXXXXXXXXXXXXXXXXXXX`

### `OPSGENIE_API_KEY`
- **Type**: String
- **Default**: None
- **Required**: **Yes** (when `ALERTING_PROVIDER=opsgenie`)
- **Description**: Opsgenie API key
- **Example**: `OPSGENIE_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

---

## Heartbeat Configuration

### `HEARTBEAT_INTERVAL_MS`
- **Type**: Integer (milliseconds)
- **Default**: `3600000` (1 hour)
- **Required**: No
- **Description**: Interval between heartbeat health checks
- **Example**: `HEARTBEAT_INTERVAL_MS=1800000`

### `HEARTBEAT_ALERT_TIMEOUT_MS`
- **Type**: Integer (milliseconds)
- **Default**: `90000` (90 seconds)
- **Required**: No
- **Description**: Timeout before triggering heartbeat alert
- **Example**: `HEARTBEAT_ALERT_TIMEOUT_MS=120000`

---

## Event Listener Configuration

### `EVENT_LISTENER_INITIAL_RETRY_DELAY`
- **Type**: Integer (milliseconds)
- **Default**: `1000`
- **Required**: No
- **Description**: Initial retry delay for event listener failures
- **Example**: `EVENT_LISTENER_INITIAL_RETRY_DELAY=2000`

### `EVENT_LISTENER_MAX_RETRY_DELAY`
- **Type**: Integer (milliseconds)
- **Default**: `60000`
- **Required**: No
- **Description**: Maximum retry delay for event listener
- **Example**: `EVENT_LISTENER_MAX_RETRY_DELAY=120000`

### `ORACLE_DRAW_REQUEST_REPLAY`
- **Type**: Boolean
- **Default**: `false`
- **Required**: No
- **Description**: Enable replay of draw request events
- **Example**: `ORACLE_DRAW_REQUEST_REPLAY=true`

---

## Logging Configuration

### `LOG_LEVEL`
- **Type**: String (enum: `error`, `warn`, `info`, `debug`, `verbose`)
- **Default**: `info`
- **Required**: No
- **Description**: Logging verbosity level
- **Example**: `LOG_LEVEL=debug`

### `LOG_DIR`
- **Type**: String (path)
- **Default**: `./logs`
- **Required**: No
- **Description**: Directory for log files
- **Example**: `LOG_DIR=/var/log/oracle`

### `LOG_TO_CONSOLE`
- **Type**: Boolean
- **Default**: `true`
- **Required**: No
- **Description**: Enable console logging
- **Example**: `LOG_TO_CONSOLE=false`

### `LOG_MAX_SIZE`
- **Type**: String
- **Default**: `20m`
- **Required**: No
- **Description**: Maximum size per log file before rotation
- **Example**: `LOG_MAX_SIZE=50m`

### `LOG_MAX_FILES`
- **Type**: String
- **Default**: `14d`
- **Required**: No
- **Description**: Maximum age of log files to retain
- **Example**: `LOG_MAX_FILES=30d`

### `LOG_ZIPPED_ARCHIVE`
- **Type**: Boolean
- **Default**: `true`
- **Required**: No
- **Description**: Compress rotated log files
- **Example**: `LOG_ZIPPED_ARCHIVE=false`

---

## Quick Start Examples

### Minimal Testnet Configuration
```bash
RAFFLE_CONTRACT_ID=CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM
ORACLE_SECRET_KEY=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Production Configuration with AWS KMS
```bash
NODE_ENV=production
PORT=3003

# Network
HORIZON_URL=https://horizon.stellar.org
SOROBAN_RPC_URL=https://soroban.stellar.org
NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015
RAFFLE_CONTRACT_ID=CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM

# Key Management
KEY_PROVIDER=aws-kms
AWS_REGION=us-east-1
AWS_KMS_KEY_ID=arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012

# Redis
REDIS_HOST=redis.production.example.com
REDIS_PORT=6379

# Alerting
ALERTING_PROVIDER=pagerduty
PAGERDUTY_ROUTING_KEY=R0XXXXXXXXXXXXXXXXXXXXXXXXXX

# Logging
LOG_LEVEL=info
LOG_DIR=/var/log/oracle
```

---

## Validation

The oracle performs comprehensive validation on startup:

1. **Required fields**: Fails fast if required environment variables are missing
2. **Type validation**: Ensures integers, floats, URLs, and enums are correctly formatted
3. **Constraint validation**: Validates relationships (e.g., `ORACLE_MED_VALUE_THRESHOLD_XLM < ORACLE_HIGH_VALUE_THRESHOLD_XLM`)
4. **Provider-specific validation**: Ensures provider-specific credentials are present

If validation fails, the oracle will log detailed error messages and exit with a non-zero status code.
