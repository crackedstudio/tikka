# Contract Spec: receive_randomness_batch

## Function Signature

```rust
pub fn receive_randomness_batch(
    env: Env,
    entries: Vec<(u32, BytesN<32>, BytesN<64>)>,
) -> Vec<Result<(), Error>>
```

## Description

Batch entry point for the oracle to submit multiple randomness reveals in a single Soroban transaction.
Processes each entry sequentially, applying the same validation as `receive_randomness`.
Always returns `Ok` at the transaction level — individual entry failures are encoded in the return vector.

## Parameters

- `entries`: A vector of `(raffle_id, seed, proof)` tuples.
  - `raffle_id: u32` — the raffle identifier
  - `seed: BytesN<32>` — 32-byte randomness seed
  - `proof: BytesN<64>` — 64-byte VRF proof (or zero-padded for PRNG)

## Return Value

`Vec<Result<(), Error>>` — one element per input entry, in input order.
- `Ok(())` — entry was processed successfully
- `Err(Error::AlreadyFinalized)` — raffle already finalized (error code 1)
- `Err(Error::InvalidProof)` — proof verification failed (error code 2)
- `Err(Error::RaffleNotFound)` — raffle ID not found (error code 3)

## Behaviour

1. For each entry in `entries`:
   a. Look up the raffle by `raffle_id`. If not found, push `Err(Error::RaffleNotFound)`.
   b. Check if already finalized. If so, push `Err(Error::AlreadyFinalized)`.
   c. Verify the proof against the stored commitment. If invalid, push `Err(Error::InvalidProof)`.
   d. Apply the randomness and finalize the raffle. Push `Ok(())`.
2. Return the result vector.
3. The transaction MUST NOT panic or revert even if all entries fail.

## Error Codes

| Code | Name | Value |
|------|------|-------|
| AlreadyFinalized | ALREADY_FINALISED | 1 |
| InvalidProof | INVALID_PROOF | 2 |
| RaffleNotFound | RAFFLE_NOT_FOUND | 3 |

## Atomicity

Each entry is processed independently. A failure in one entry does not affect others.
The transaction itself always succeeds at the Soroban level.

## Requirements

- Req 7.1: Accepts Vec of (u32, BytesN<32>, BytesN<64>) entries
- Req 7.2: Applies same validation as receive_randomness per entry
- Req 7.3: Individual failures do not abort remaining entries
- Req 7.4: Returns Vec<Result<(), Error>> preserving input order
- Req 7.5: Transaction-level Ok even when all entries fail
