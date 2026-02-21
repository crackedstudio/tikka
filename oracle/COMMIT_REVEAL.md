# Commit-Reveal Randomness for High-Stakes Raffles

## Overview

Commit-reveal prevents oracle front-running by requiring the oracle to commit to randomness before the raffle ends, then reveal after draw is triggered.

## How It Works

### Commit Phase (Before end_time)
1. Oracle generates random `secret` and `nonce`
2. Computes `commitment = SHA-256(secret || nonce)`
3. Submits commitment to contract via `commit_randomness(raffleId, commitment)`
4. Stores secret/nonce locally for later reveal

### Reveal Phase (After draw triggered)
1. Oracle retrieves stored secret/nonce
2. Submits to contract via `reveal_randomness(raffleId, secret, nonce)`
3. Contract verifies: `SHA-256(secret || nonce) == stored_commitment`
4. If valid, uses secret as randomness seed for winner selection

## Security Properties

- **Front-running prevention**: Oracle cannot observe ticket purchases after committing
- **Unpredictability**: Secret is cryptographically random
- **Verifiability**: Anyone can verify the reveal matches the commitment
- **Non-manipulability**: Oracle cannot change commitment after submission

## Usage

```typescript
// Commit phase (before raffle ends)
await commitRevealWorker.processCommit({
  raffleId: 1,
  endTime: Date.now() + 86400000,
});

// Reveal phase (after draw triggered)
await commitRevealWorker.processReveal({
  raffleId: 1,
  requestId: 'req-123',
});
```

## Contract Interface

The contract must implement:

```rust
// Commit phase
pub fn commit_randomness(env: Env, raffle_id: u32, commitment: BytesN<32>)

// Reveal phase
pub fn reveal_randomness(env: Env, raffle_id: u32, secret: BytesN<32>, nonce: BytesN<16>)
```

Contract verification:
```rust
let computed = sha256(secret || nonce);
assert_eq!(computed, stored_commitment);
```

## Implementation Status

✅ CommitmentService - Generate and store commitments  
✅ CommitRevealWorker - Process commit and reveal phases  
✅ Unit tests for commitment verification  
⏳ Contract integration (waiting for contract support)  
⏳ TxSubmitter methods for commit/reveal transactions  

## Configuration

Set threshold for commit-reveal vs direct randomness:

```typescript
// In worker configuration
const USE_COMMIT_REVEAL = prizeAmount >= 500; // XLM

if (USE_COMMIT_REVEAL) {
  await commitRevealWorker.processCommit(...);
  // Later...
  await commitRevealWorker.processReveal(...);
} else {
  await randomnessWorker.processRequest(...);
}
```

## Testing

```bash
npm test commitment.service.spec.ts
```

## Notes

- Commitment storage is in-memory; consider persistent storage for production
- Ensure commit happens before end_time to prevent front-running
- Monitor for failed reveals and implement retry logic
