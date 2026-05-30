# Oracle Randomness Worker

## Overview

The randomness worker processes pending randomness requests from the queue. It determines whether to use VRF (high-stakes) or PRNG (low-stakes), computes the seed and proof, and submits the result to the Soroban contract.

## Architecture

```
RandomnessRequested Event (Stellar Horizon)
        ↓
    Bull Queue (Redis) with Priority
        ↓
RandomnessWorker.handleRandomnessJob()
        ↓
    ┌───┴────────────────────────┐
    │ 1. Check contract status   │
    │ 2. Get prize amount        │
    │ 3. Determine VRF/PRNG      │
    │ 4. Compute randomness      │
    │ 5. Submit to contract      │
    │ 6. Track SLA (high-priority)│
    └────────────────────────────┘
```

## Features

### Priority Queue Processing
- **Automatic priority assignment** based on prize amount
- **High-stakes raffles (≥500 XLM)**: HIGH priority (processed first)
- **Standard raffles (<500 XLM)**: NORMAL priority
- **Manual priority override** via contract event flag
- **SLA monitoring** for high-priority jobs (5s threshold)

See [PRIORITY_QUEUE_IMPLEMENTATION.md](./PRIORITY_QUEUE_IMPLEMENTATION.md) for details.

## Processing Flow

### 1. Job Enqueuing
- Event listener enqueues jobs into Bull with `attempts: 5` and exponential backoff.
- Redis acts as the persistent store for the queue.

### 2. Contract Status Check
- Queries contract to verify raffle not already finalized.
- Serves as the primary idempotency check for retried jobs and re-emitted events.

### 3. Prize Amount Determination
- Uses `prizeAmount` from event payload if available
- Falls back to `ContractService.getRaffleData()` RPC call if not

### 4. Method Selection
- **High-stakes (≥ 500 XLM)**: Uses VRF for cryptographic verifiability
- **Low-stakes (< 500 XLM)**: Uses PRNG for instant, zero-cost randomness

### 5. Randomness Computation
- **VrfService**: Ed25519 VRF with proof generation
- **PrngService**: SHA-256 PRNG with timestamp + entropy

### 6. Transaction Submission
- Builds `receive_randomness(raffleId, seed, proof)` transaction
- Signs with oracle keypair
- Submits to Soroban RPC
- Polls for confirmation

## Services

### RandomnessWorker
Consumer processor that handles jobs from the `randomness-queue`.

**Key Methods:**
- `@Process() handleRandomnessJob(job: Job<RandomnessJobPayload>): Promise<void>` - Processes a single job

### ContractService
Interacts with Soroban contract for read operations.

**Methods:**
- `getRaffleData(raffleId): Promise<RaffleData>` - Fetches raffle details
- `isRandomnessSubmitted(raffleId): Promise<boolean>` - Checks if already finalized

### VrfService
Generates verifiable random function output for high-stakes raffles.

**Methods:**
- `compute(requestId): Promise<RandomnessResult>` - Computes VRF seed + proof

### PrngService
Generates pseudo-random output for low-stakes raffles.

**Methods:**
- `compute(requestId): Promise<RandomnessResult>` - Computes PRNG seed

### TxSubmitterService
Submits randomness to the contract with robust fault tolerance, explicit state machine tracking, and strictly typed outcomes.

**Primary Method:**
- `submitRandomnessTyped(raffleId, requestId, randomness): Promise<TransactionOutcome>` - Submits with typed outcomes

**Legacy Method (Deprecated):**
- `submitRandomness(raffleId, randomness): Promise<SubmitResult>` - Backward compatibility wrapper

**Features:**
- ✅ Explicit transaction lifecycle state machine (BUILDING → SIGNING → SUBMITTING → POLLING → TERMINAL)
- ✅ Strictly typed outcomes (7 distinct outcome types with discriminated union)
- ✅ Duplicate detection and handling (treats as success)
- ✅ Polling strategy with 30-second timeout and 1-second intervals
- ✅ Timeout fallback that polls transaction hash on 504 errors
- ✅ Error classification matrix (retriable vs non-retriable)
- ✅ Structured telemetry logging with all required fields
- ✅ RPC failover to backup endpoints
- ✅ Comprehensive test suite with 95%+ coverage

📖 **See [Transaction Submitter Guide](./src/submitter/TX_SUBMITTER_GUIDE.md) for complete documentation**  
📋 **See [Transaction Submitter Quick Reference](./src/submitter/TX_SUBMITTER_QUICK_REF.md) for quick reference**

## Error Handling & Retries

- Worker throws errors on failure to trigger queue retry mechanism
- Idempotency ensures safe retries (won't double-submit)
- Contract status check prevents submission to finalized raffles

## Testing

Run unit tests:
```bash
npm test
```

**Test Coverage:**
- ✅ Low-stakes PRNG path
- ✅ High-stakes VRF path
- ✅ Prize amount fetching from contract
- ✅ Duplicate request handling
- ✅ Already-finalized raffle handling
- ✅ Error handling and retry behavior

## Health & Monitoring

### Endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Liveness check — returns `healthy`/`unhealthy` + pending lag count |
| `GET /oracle/status` | Full status — metrics, lag, RPC health, multi-oracle state, recent errors |

**`GET /health` response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-04-23T12:00:00.000Z",
  "pendingLagRequests": 0
}
```

**`GET /oracle/status` response (abbreviated):**
```json
{
  "status": "healthy",
  "metrics": {
    "queueDepth": 2,
    "lastProcessedAt": "2026-04-23T11:59:00.000Z",
    "totalProcessed": 142,
    "totalFailed": 1,
    "successRate": "99.30%",
    "streamStatus": "connected"
  },
  "lag": {
    "pendingCount": 1,
    "pendingRequests": [
      { "requestId": "req-abc", "raffleId": 7, "requestedAtLedger": 1234500 }
    ]
  },
  "rpc": [{ "url": "https://soroban-testnet.stellar.org", "healthy": true }],
  "recentErrors": []
}
```

### Lag Alerting

`LagMonitorService` tracks every `RandomnessRequested` event by ledger number. If a request is not fulfilled within **100 ledgers** (~8 minutes on Stellar), an `[ALERT]` log is emitted:

```
[ALERT] Request req-abc for raffle 7 not fulfilled within 100 ledgers. Lag: 103
```

### Recommended Monitoring Setup

- **Liveness probe**: `GET /health` — use as Kubernetes `livenessProbe`
- **Alerting**: Scrape logs for `[ALERT]` pattern or wire a log aggregator
- **Metrics**: `queueDepth > 10` warns; `queueDepth > 50` marks unhealthy
- **Heartbeat**: Oracle pings the contract every `HEARTBEAT_INTERVAL_MS` (default: 1 hour)
## Queue & Redis

The oracle uses **Bull** (backed by Redis) to reliably process randomness requests with an **explicit state machine** for lifecycle management.

### Queue State Machine

The queue implements a robust state machine with 8 distinct states:

```
queued → generating → submitting → confirming → confirmed ✓
   ↓         ↓            ↓            ↓
   └─────────┴────────────┴────────────→ retrying → (back to generating or dead-lettered)
```

**States:**
- `queued` - Waiting for processing slot
- `generating` - Computing randomness (VRF/PRNG)
- `submitting` - Sending transaction to network
- `confirming` - Waiting for on-chain confirmation
- `confirmed` - ✅ Success (terminal)
- `retrying` - In backoff before next attempt
- `failed` - ❌ Non-retriable error (terminal)
- `dead-lettered` - ⚠️ Max retries exhausted, requires manual rescue (terminal)

### Queue Configuration

| Setting | Default | Environment Variable |
|---------|---------|---------------------|
| Queue name | `randomness-queue` | - |
| Max retries | 5 | `QUEUE_MAX_RETRIES` |
| Initial backoff | 2000ms | `QUEUE_INITIAL_BACKOFF_MS` |
| Backoff multiplier | 2 (exponential) | `QUEUE_BACKOFF_MULTIPLIER` |
| Max backoff | 60000ms (1 min) | `QUEUE_MAX_BACKOFF_MS` |
| Confirmation timeout | 30000ms (30s) | `QUEUE_CONFIRMATION_TIMEOUT_MS` |
| Max concurrency | 10 | `QUEUE_MAX_CONCURRENCY` |
| Generation timeout | 15000ms (15s) | `QUEUE_GENERATION_TIMEOUT_MS` |
| Submission timeout | 45000ms (45s) | `QUEUE_SUBMISSION_TIMEOUT_MS` |

### Queue Monitoring Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /queue/metrics` | Comprehensive metrics by state |
| `GET /queue/health` | Health status (healthy/degraded/unhealthy) |
| `GET /queue/jobs/:state` | Jobs in specific state |
| `GET /queue/dead-letter` | Jobs requiring manual rescue |
| `GET /queue/config` | Current configuration |

**Example metrics response:**
```json
{
  "queuedCount": 5,
  "generatingCount": 2,
  "submittingCount": 1,
  "confirmingCount": 3,
  "retryingCount": 1,
  "confirmedCount": 150,
  "failedCount": 2,
  "deadLetteredCount": 0,
  "pendingCount": 12,
  "totalFailedCount": 2
}
```

**Required environment variables:**

```
REDIS_HOST=localhost   # Redis server hostname
REDIS_PORT=6379        # Redis server port
```

Redis must be running before starting the oracle. A minimal local setup:

```bash
docker run -d -p 6379:6379 redis:7-alpine
```

📖 **See [QUEUE_STATE_MACHINE_IMPLEMENTATION.md](./QUEUE_STATE_MACHINE_IMPLEMENTATION.md) for complete documentation**  
📋 **See [QUEUE_STATE_MACHINE_QUICK_REF.md](./QUEUE_STATE_MACHINE_QUICK_REF.md) for quick reference**

## Configuration

The service requires the following environment variables for queue operations:

- `REDIS_HOST`: Redis server host (default: `localhost`)
- `REDIS_PORT`: Redis server port (default: `6379`)
- `SOROBAN_RPC_URL`: primary Soroban RPC endpoint for submission
- `SOROBAN_RPC_FALLBACK_URLS`: optional comma-separated fallback RPC endpoints
- `RAFFLE_CONTRACT_ID`: raffle contract address
- `NETWORK_PASSPHRASE`: Stellar network passphrase
- `TX_SUBMIT_MAX_ATTEMPTS`: max tx submit attempts (default: `5`)
- `TX_SUBMIT_INITIAL_BACKOFF_MS`: initial backoff delay (default: `1000`)
- `TX_SUBMIT_ALERT_WEBHOOK_URL`: optional alert webhook for persistent submit failures
- `ORACLE_CB_FAILURE_THRESHOLD`: number of consecutive Horizon SSE failures before the circuit opens (default: `5`)
- `ORACLE_CB_RESET_TIMEOUT_MS`: milliseconds the circuit stays open before allowing a probe attempt (default: `60000`)

## Implementation Status

✅ Worker logic implemented  
✅ VRF/PRNG branching  
✅ Bull Queue integration (Redis-backed)  
✅ Unit tests with mocks  
✅ ContractService RPC calls integrated  
✅ VrfService integration scaffolded  
✅ TxSubmitterService builds/signs/submits `receive_randomness` with retry/backoff  

## Manual Rescue Tool

When jobs fail after all retries, operators can use the rescue CLI for manual intervention:

```bash
# Re-enqueue a failed job
npm run oracle:rescue re-enqueue <jobId> --operator <name> --reason <reason>

# Force submit randomness manually
npm run oracle:rescue force-submit <raffleId> <requestId> --operator <name> --reason <reason>

# Mark job as failed (invalid/malicious)
npm run oracle:rescue force-fail <jobId> --operator <name> --reason <reason>

# List failed jobs
npm run oracle:rescue list-failed

# View rescue audit logs
npm run oracle:rescue logs
```

See [RESCUE_GUIDE.md](./RESCUE_GUIDE.md) for detailed usage and [ON_CALL_TROUBLESHOOTING.md](./ON_CALL_TROUBLESHOOTING.md) for on-call procedures.

## Next Steps

1. Expand integration tests against live Stellar testnet and failure modes
2. Wire alert webhook to on-call paging workflow
3. Add additional metrics for retry/failure counts by error class
4. Harden idempotency behavior for duplicate submission races

## Security: Key Management

⚠️ **IMPORTANT:** The oracle now supports secure HSM-backed key management to eliminate the risk of exposing private keys in environment variables.

### Quick Start

**Development (Insecure):**
```bash
KEY_PROVIDER=env
ORACLE_SECRET_KEY=S... # or ORACLE_PRIVATE_KEY
```

**Production (Secure):**
```bash
# AWS KMS
KEY_PROVIDER=aws-kms
AWS_REGION=us-east-1
AWS_KMS_KEY_ID=arn:aws:kms:...

# OR Google Cloud KMS
KEY_PROVIDER=gcp-kms
GCP_PROJECT_ID=my-project
GCP_KEY_RING_ID=oracle-keys
GCP_KEY_ID=oracle-signing-key
```

### Documentation

- 📖 [Key Management Guide](./docs/KEY_MANAGEMENT.md) - Comprehensive setup and configuration
- 🚀 [Quick Start](./docs/KEY_MANAGEMENT_QUICK_START.md) - Get started in 5 minutes
- 🔄 [Migration Guide](./docs/MIGRATION_TO_HSM.md) - Migrate from env vars to HSM
- 📋 [Implementation Summary](./docs/HSM_IMPLEMENTATION_SUMMARY.md) - Technical details

### Benefits

✅ Private keys never exposed in memory  
✅ All signing operations audited  
✅ Centralized key management  
✅ Automated key rotation  
✅ Compliance with security standards
