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

## Next Steps

1. Integrate Stellar SDK for contract RPC calls
2. Implement Ed25519 VRF (e.g., using `@noble/curves`)
3. Implement Soroban transaction building and signing
4. Add integration tests against Stellar testnet
5. Configure oracle keypair management (HSM/secrets)
