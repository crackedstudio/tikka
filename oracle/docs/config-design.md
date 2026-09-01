<!-- merged from CONFIG_README.md -->

# Oracle Configuration System

A type-safe, validated configuration system for the Tikka Oracle service.

## Features

- ✅ **Type-safe**: Full TypeScript support with inferred types
- ✅ **Validated**: Zod schema validation with actionable error messages
- ✅ **Fail-fast**: Startup fails immediately with clear errors for invalid config
- ✅ **Centralized**: Single source of truth for all configuration
- ✅ **Documented**: Comprehensive documentation for all environment variables
- ✅ **Tested**: Full test coverage for validation logic

## Quick Start

### 1. Import the Configuration Module

```typescript
import { OracleConfigModule } from './config';

@Module({
  imports: [
    OracleConfigModule.forRoot(),
    // ... other modules
  ],
})
export class AppModule {}
```

### 2. Inject the Configuration Service

```typescript
import { OracleConfigService } from './config';

@Injectable()
export class MyService {
  constructor(private readonly config: OracleConfigService) {
    const stellar = this.config.getStellar();
    console.log(`Contract ID: ${stellar.raffleContractId}`);
  }
}
```

### 3. Access Configuration

```typescript
// Get specific configuration sections
const stellar = this.config.getStellar();
const keyProvider = this.config.getKeyProvider();
const queue = this.config.getQueue();
const vrf = this.config.getVrf();

// Or get the complete config
const fullConfig = this.config.getConfig();
```

## Configuration Sections

The configuration is organized into logical sections:

| Section | Method | Description |
|---------|--------|-------------|
| Server | `getServer()` | HTTP server settings |
| Stellar | `getStellar()` | Horizon, Soroban RPC, contract IDs |
| Key Provider | `getKeyProvider()` | Key management (env, AWS KMS, GCP KMS) |
| Queue | `getQueue()` | Redis and Bull queue settings |
| VRF | `getVrf()` | VRF threshold configuration |
| Circuit Breaker | `getCircuitBreaker()` | Horizon SSE circuit breaker |
| Priority Queue | `getPriorityQueue()` | Priority tier thresholds |
| Fee | `getFee()` | Transaction fee limits |
| TX Submission | `getTxSubmission()` | Transaction retry settings |
| Multi-Oracle | `getMultiOracle()` | Multi-oracle coordination |
| Supabase | `getSupabase()` | Audit logging database |
| Alerting | `getAlerting()` | PagerDuty/Opsgenie alerts |
| Heartbeat | `getHeartbeat()` | Health check intervals |
| Event Listener | `getEventListener()` | Event streaming settings |
| Logging | `getLogging()` | Winston logger configuration |

## Type Safety

All configuration is fully typed:

```typescript
import { StellarNetworkConfig, KeyProviderConfig } from './config';

const stellar: StellarNetworkConfig = this.config.getStellar();
const keyProvider: KeyProviderConfig = this.config.getKeyProvider();

// TypeScript knows the exact shape of each config section
if (keyProvider.type === 'aws-kms') {
  console.log(keyProvider.awsRegion); // ✅ Type-safe
  console.log(keyProvider.privateKey); // ❌ TypeScript error
}
```

## Validation

The configuration system validates:

1. **Required fields**: Ensures critical settings are present
2. **Type correctness**: Validates integers, floats, URLs, enums
3. **Constraints**: Enforces relationships between values
4. **Provider-specific requirements**: Validates credentials for selected providers

### Example Validation Errors

```bash
# Missing required field
Error: Invalid configuration: Required at "stellar.raffleContractId"

# Invalid URL
Error: Invalid configuration: Invalid url at "stellar.horizo

<!-- merged from DELIVERABLES.md -->

# Oracle Configuration System - Deliverables

## ✅ Complete - All Acceptance Criteria Met

### 📋 Acceptance Criteria Status

| Criteria | Status | Evidence |
|----------|--------|----------|
| Tests cover missing secrets, invalid network, and invalid threshold values | ✅ Complete | `config.loader.spec.ts` - 20+ test cases |
| Startup fails fast with actionable config errors | ✅ Complete | Zod validation with detailed error messages |
| Configuration consolidated in `oracle/src/config` | ✅ Complete | All files in dedicated package |
| Documentation for required env vars | ✅ Complete | `ENVIRONMENT_VARIABLES.md` with full reference |

---

## 📦 Files Delivered

### Core Implementation (5 files)
```
oracle/src/config/
├── config.schema.ts              # Zod schemas for all config sections
├── config.loader.ts              # Environment variable loader
├── oracle-config.module.ts       # NestJS module
├── oracle-config.service.ts      # Type-safe service
└── index.ts                      # Public API exports
```

### Tests (2 files)
```
oracle/src/config/
├── config.loader.spec.ts         # Validation tests (20+ cases)
└── oracle-config.service.spec.ts # Service integration tests
```

### Documentation (5 files)
```
oracle/src/config/
├── ENVIRONMENT_VARIABLES.md      # Complete env var reference (60+ vars)
├── IMPLEMENTATION_SUMMARY.md     # Implementation overview
├── VERIFICATION_CHECKLIST.md     # Step-by-step verification guide
├── usage.example.ts              # 10 practical code examples
└── DELIVERABLES.md              # This file
```

### Tools (1 file)
```
oracle/src/config/
└── verify-config.ts              # Configuration verification script
```

### Updated Files (3 files)
```
oracle/
├── .env.example                  # Updated with all variables
├── package.json                  # Added zod, dotenv, config:verify script
└── src/app.module.ts            # Integrated OracleConfigModule
```

---

## 🎯 What Was Built

### 1. Type-Safe Configuration Schema
- **14 configuration sections** covering all Oracle subsystems
- **Discriminated unions** for key providers (env, AWS KMS, GCP KMS)
- **Constraint validation** (e.g., thresholds must be in correct order)
- **Full TypeScript inference** - no manual type annotations needed

### 2. Validated Configuration Loader
- **Centralized `process.env` access** - no more scattered reads
- **Type coercion** - strings → integers, floats, booleans, URL arrays
- **Fail-fast validation** - catches errors at startup
- **Actionable error messages** - tells you exactly what's wrong

### 3. NestJS Integration
- **Global module** - import once, use everywhere
- **Dependency injection** - inject `OracleConfigService` into any service
- **Cached configuration** - validated once at startup

### 4. Comprehensive Testing
- **Missing secrets** - RAFFLE_CONTRACT_ID, key provider credentials
- **Invalid network** - bad URLs, empty passphrase, invalid fallback URLs
- **Invalid thresholds** - negative, zero, wrong order
- **Provider validation** - AWS KMS, GCP KMS, alerting providers
- **Type coercion** - boolean, integer, float parsing
- **Valid scenarios** - all key providers, all config sections

### 5. Complete Documentation
- **60+ environment variables** documented with type, default, example
- **Security warnings** for sensitive variables
- **Quick start examples** for testnet and production
- **Migration guide** from old ConfigService to new OracleConfigService
- **Usage examples** for all configuration sections

---

## 🔍 Test Coverage

### Validation Tests (`config.loader.spec.ts`)

**Missing Required Configuration (6 tests)**
- ✅ Missing RAFFLE_CONTRACT_ID
- ✅ Missing private key (KEY_PROVIDER=env)
- ✅ Missing AWS_REGION (KEY_PROVIDER=aws-kms)
- ✅ Missing AWS_KMS_KEY_ID (KEY_PROVIDER=aws-kms)
- ✅ Missing GCP_PROJECT_ID (KEY_PROVIDER=gcp-kms)
- ✅ Missing SUPABASE_SERVICE_ROLE_KEY (when SUPABASE_URL set)

**Invalid Network Configuration (4 tests)**
- ✅ Invalid HORIZON_URL
- ✅ Invalid SOROBAN_RPC_URL
- ✅ Invalid SOROBAN_RPC_FALLBACK_URLS
- ✅ Empty NETWORK_PASSPHRASE

**Invalid Threshold Values (6 tests)**
- ✅ Negative VRF_THRESHOLD_XLM
- ✅ Zero VRF_THRESHOLD_XLM
- ✅ MED >= HIGH threshold
- ✅ MED > HIGH threshold
- ✅ Zero ORACLE_CB_FAILURE_THRESHOLD
- ✅ Negative ORACLE_CB_RESET_TIMEOUT_MS

**Invalid Alerting Configuration (2 tests)**
- ✅ Missing PAGERDUTY_ROUTING_KEY
- ✅ Missing OPSGENIE_API_KEY

**Valid Configuration (8 tests)**
- ✅ Minimal valid config with defaults
- ✅ AWS KMS provider
- ✅ GCP KMS provider
- ✅ Custom thresholds
- ✅ Supabase configuration
- ✅ Alerting configuration
- ✅ Comma-separated fallback URLs
- ✅ Multi-oracle configuration

**Type Coercion (3 tests)**
- ✅ Boolean parsing (true, false, 1, 0)
- ✅ Integer parsing
- ✅ Float parsing

### Service Tests (`oracle-config.service.spec.ts`)

- ✅ Service initialization
- ✅ All getter methods return correct types
- ✅ Configuration sections are properly structured

---

## 🚀 How to Use

### 1. Install Dependencies
```bash
cd oracle
npm install  # or pnpm install
```

### 2. Set Up Environment
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Verify Configuration
```bash
npm run config:verify
```

### 4. Run Tests
```bash
npm test -- src/config/config.loader.spec.ts
npm test -- src/config/oracle-config.service.spec.ts
```

### 5. Build
```bash
npm run build
```

### 6. Start Oracle
```bash
npm run start
```

---

## 📊 Configuration Sections

| Section | Variables | Description |
|---------|-----------|-------------|
| Server | 2 | HTTP port, Node environment |
| Stellar Network | 5 | Horizon, Soroban RPC, contract ID |
| Key Provider | 10 | Env, AWS KMS, GCP KMS credentials |
| Queue | 10 | Redis, retries, timeouts, concurrency |
| VRF | 1 | Threshold for VRF vs PRNG |
| Circuit Breaker | 2 | Failure threshold, reset timeout |
| Priority Queue | 2 | High/medium value thresholds |
| Fee | 3 | Max/min fees, low stakes threshold |
| TX Submission | 3 | Max attempts, backoff, webhook |
| Multi-Oracle | 8 | Mode, registry, peers, threshold |
| Supabase | 3 | URL, service role key, anon key |
| Alerting | 3 | Provider, PagerDuty, Opsgenie |
| Heartbeat | 2 | Interval, alert timeout |
| Event Listener | 3 | Retry delays, replay flag |
| Logging | 6 | Level, directory, rotation settings |

**Total: 63 environment variables** (all documented)

---

## ✨ Key Benefits

1. **Type Safety** - Full TypeScript support with inference
2. **Validation** - Comprehensive validation with clear errors
3. **Fail-Fast** - Invalid config caught at startup
4. **Centralized** - Single source of truth
5. **Documented** - Complete reference for all variables
6. **Tested** - 20+ test cases covering all scenarios
7. **Maintainable** - Easy to add new configuration
8. **Secure** - Sensitive values clearly marked

---

## 🎓 Next Steps

### For Immediate Use
1. ✅ Configuration system is ready to use
2. ✅ Tests pass and validate all scenarios
3. ✅ Documentation is complete
4. ✅ App module is integrated

### For Full Migration (Optional)
Update existing services to use `OracleConfigService`:
- Key Service (`src/keys/key.service.ts`)
- Circuit Breaker (`src/listener/circuit-breaker.service.ts`)
- Queue Module (`src/queue/queue.module.ts`)
- Submitter Services (`src/submitter/*.ts`)
- Logger (`src/logger/oracle-logger.ts`)
- Main (`src/main.ts`)

See `IMPLEMENTATION_SUMMARY.md` for migration examples.

---

## 📞 Support

- **Documentation**: See `ENVIRONMENT_VARIABLES.md` for complete reference
- **Examples**: See `usage.example.ts` for code examples
- **Verification**: Run `npm run config:verify` to check configuration
- **Testing**: Run `npm test -- src/config/` to run all config tests

---

## ✅ Sign-Off

**Implementation Status**: ✅ **COMPLETE**

All acceptance criteria have been met:
- ✅ Tests cover missing secrets, invalid network, and invalid threshold values
- ✅ Startup fails fast with actionable config errors
- ✅ Configuration consolidated in `oracle/src/config`
- ✅ Documentation for required env vars

The Oracle configuration system is production-ready and fully tested.


<!-- merged from ENVIRONMENT_VARIABLES.md -->

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

### Key age / rotation tracking

#### `ORACLE_KEY_CREATED_AT`
- **Type**: ISO-8601 date or datetime
- **Default**: None
- **Required**: No (recommended)
- **Description**: When the active oracle signing key was created or last rotated. Used by `config:verify` and startup to warn when the key is older than `ORACLE_KEY_MAX_AGE_DAYS`.
- **Example**: `ORACLE_KEY_CREATED_AT=2026-07-27T00:00:00Z`
- **See**: `docs/runbooks/oracle-key-rotation.md`

#### `ORACLE_KEY_MAX_AGE_DAYS`
- **Type**: Positive integer
- **Default**: `90`
- **Required**: No
- **Description**: Maximum recommended key age in days. Exceeding this emits a **warning** (does not fail startup by itself).
- **Example**: `ORACLE_KEY_MAX_AGE_DAYS=90`

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

### `ALERT_WEBHOOK_URL`
- **Type**: String (URL)
- **Default**: None
- **Required**: No
- **Description**: Slack-compatible webhook URL. When set, alerts are POSTed here in addition to (or instead of) `ALERTING_PROVIDER`. Fires on circuit breaker OPEN, dead-letter queue depth exceeding `DLQ_DEPTH_ALERT_THRESHOLD`, and VRF signing key unavailability. Each payload includes `oracle_id`, `raffle_id` (when applicable), and severity.
- **Example**: `ALERT_WEBHOOK_URL=https://hooks.slack.com/services/T00/B00/XXXX`

### `DLQ_DEPTH_ALERT_THRESHOLD`
- **Type**: Integer
- **Default**: `5`
- **Required**: No
- **Description**: Number of dead-lettered jobs that triggers a critical alert
- **Example**: `DLQ_DEPTH_ALERT_THRESHOLD=10`

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
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/T00/B00/XXXX
DLQ_DEPTH_ALERT_THRESHOLD=10

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


<!-- merged from ENV_VARS.md -->



<!-- merged from MIGRATION_GUIDE.md -->



<!-- merged from README.md -->