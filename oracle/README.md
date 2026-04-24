# Oracle Randomness Worker

## Overview

The randomness worker processes pending randomness requests from the queue. It determines whether to use VRF (high-stakes) or PRNG (low-stakes), computes the seed and proof, and submits the result to the Soroban contract.

## Architecture

```
RandomnessRequested Event (Stellar Horizon)
        ↓
    Bull Queue (Redis)
        ↓
RandomnessWorker.handleRandomnessJob()
        ↓
    ┌───┴────────────────────────┐
    │ 1. Check contract status   │
    │ 2. Get prize amount        │
    │ 3. Determine VRF/PRNG      │
    │ 4. Compute randomness      │
    │ 5. Submit to contract      │
    └────────────────────────────┘
```

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
Submits randomness to the contract.

**Methods:**
- `submitRandomness(raffleId, randomness): Promise<SubmitResult>` - Submits transaction

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

The oracle uses **Bull** (backed by Redis) to reliably process randomness requests.

| Setting | Value |
|---------|-------|
| Queue name | `randomness-queue` |
| Retries | 5 attempts, exponential backoff (2 s base) |
| Failed jobs | Retained in Redis for inspection (`removeOnFail: false`) |
| Alert | `[ALERT]` log emitted when all attempts are exhausted |

**Required environment variables:**

```
REDIS_HOST=localhost   # Redis server hostname
REDIS_PORT=6379        # Redis server port
```

Redis must be running before starting the oracle. A minimal local setup:

```bash
docker run -d -p 6379:6379 redis:7-alpine
```

## Configuration

The service requires the following environment variables for queue operations:

- `REDIS_HOST`: Redis server host (default: `localhost`)
- `REDIS_PORT`: Redis server port (default: `6379`)

## Implementation Status

✅ Worker logic implemented  
✅ VRF/PRNG branching  
✅ Bull Queue integration (Redis-backed)  
✅ Unit tests with mocks  
⏳ ContractService RPC calls need Stellar SDK integration  
⏳ VrfService needs Ed25519 VRF library  
⏳ TxSubmitterService needs Soroban transaction building  

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

1. Integrate Stellar SDK for contract RPC calls
2. Implement Ed25519 VRF (e.g., using `@noble/curves`)
3. Implement Soroban transaction building and signing
4. Add integration tests against Stellar testnet

## Security: Key Management

⚠️ **IMPORTANT:** The oracle now supports secure HSM-backed key management to eliminate the risk of exposing private keys in environment variables.

### Quick Start

**Development (Insecure):**
```bash
KEY_PROVIDER=env
ORACLE_PRIVATE_KEY=S...
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
