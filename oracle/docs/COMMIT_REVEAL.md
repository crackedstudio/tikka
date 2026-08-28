# Commit-Reveal Randomness for High-Stakes Raffles

## Overview

Commit-reveal prevents oracle front-running by requiring the oracle to commit to randomness before the raffle ends, then reveal after the draw is triggered. The contract verifies `SHA-256(secret || nonce) == stored_commitment`.

## Event Flow

```
RaffleCreated event
        ↓
CommitRevealWorker.processCommit()
  → CommitmentService.commit(raffleId)       — generates secret + nonce, stores locally
  → TxSubmitterService.submitCommitment()    — calls commit_randomness(raffle_id, commitment)

DrawTriggered event
        ↓
CommitRevealWorker.processReveal()
  → CommitmentService.reveal(raffleId)       — retrieves stored secret + nonce
  → TxSubmitterService.submitReveal()        — calls reveal_randomness(raffle_id, secret, nonce)
  → CommitmentService.clearCommitment()      — removes local state
```

## Contract Interface (Required)

The Soroban contract must implement both functions:

```rust
/// Commit phase — oracle submits hash before raffle ends
pub fn commit_randomness(env: Env, raffle_id: u32, commitment: BytesN<32>)

/// Reveal phase — oracle reveals preimage after draw is triggered
pub fn reveal_randomness(env: Env, raffle_id: u32, secret: BytesN<32>, nonce: BytesN<16>)
```

Contract verification logic:
```rust
let computed: BytesN<32> = env.crypto().sha256(&Bytes::from_slice(&env, &[secret.as_ref(), nonce.as_ref()].concat()));
assert_eq!(computed, stored_commitment, "commitment mismatch");
```

For low-stakes raffles that use single-shot randomness, the contract must also implement:
```rust
pub fn receive_randomness(env: Env, raffle_id: u32, seed: BytesN<32>, proof: BytesN<64>)
```

## Oracle Events Consumed

| Event name | Trigger | Oracle action |
|---|---|---|
| `RaffleCreated` | New raffle created | `commit_randomness` |
| `DrawTriggered` | Draw initiated | `reveal_randomness` |
| `RandomnessRequested` | Low-stakes draw | `receive_randomness` (direct) |

Event payload (XDR map):
- `RaffleCreated`: `{ raffle_id: u32, end_time: u64 }`
- `DrawTriggered`: `{ raffle_id: u32, request_id: string|u64|bytes }`
- `RandomnessRequested`: `{ raffle_id: u32, request_id: string|u64|bytes }`

## Security Properties

- **Front-running prevention**: Oracle commits before ticket sales close; cannot observe final ticket set before choosing randomness
- **Unpredictability**: Secret is 32 cryptographically random bytes
- **Verifiability**: Anyone can verify `SHA-256(secret || nonce) == commitment`
- **Non-manipulability**: Commitment is on-chain before the draw; oracle cannot change it

## Configuration

```env
# Enable commit-reveal for high-stakes raffles (prize >= threshold)
COMMIT_REVEAL_ENABLED=true          # default: true when contract supports it
HIGH_STAKES_THRESHOLD_XLM=500       # raffles above this use commit-reveal + VRF
```

Low-stakes raffles (prize < threshold) skip commit-reveal and call `receive_randomness` directly via `RandomnessWorker`.

## Implementation Status

| Component | Status |
|---|---|
| `CommitmentService` — generate/store/verify commitments | ✅ |
| `CommitRevealWorker` — processCommit / processReveal | ✅ |
| `TxSubmitterService.submitCommitment` | ✅ |
| `TxSubmitterService.submitReveal` | ✅ |
| `EventListenerService` — `RaffleCreated` → commit | ✅ |
| `EventListenerService` — `DrawTriggered` → reveal | ✅ |
| Contract `commit_randomness` / `reveal_randomness` | ⏳ Pending contract deployment |
| Persistent commitment storage (Redis/DB) | ⏳ Currently in-memory |

## Notes

- Commitment storage is in-memory. A process restart before reveal will lose pending commitments. For production, persist to Redis or a database keyed by `raffle_id`.
- Ensure `commit_randomness` is called before `end_time` to prevent front-running.
- If a reveal fails after max retries, the job is retained in the Bull dead-letter queue and an `[ALERT]` log is emitted.
