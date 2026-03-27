# Security Implications of User-Provided Entropy (Custom Seeds)

## Overview

The custom-prng-seeds feature allows raffle operators to supply their own 32-byte entropy value ("custom seed") when calling `request_randomness`. This document describes the entropy-mixing scheme, its security properties, and the conditions under which a malicious caller could influence the output.

## Entropy-Mixing Scheme

When a custom seed is provided, the oracle derives the final PRNG seed as:

```
seed = SHA-256( requestId_bytes || customSeed_bytes [|| raffleId_u32_BE] )
```

When no custom seed is provided, the derivation falls back to:

```
seed = SHA-256( requestId_bytes [|| raffleId_u32_BE] )
```

The proof is **never** affected by the custom seed:

```
proof = SHA-256("PRNG:v1:1:" || requestId_bytes)
     || SHA-256("PRNG:v1:2:" || requestId_bytes)
```

## Bias Analysis

### What a caller can do

A caller who knows `requestId` **in advance** can choose a `customSeed` to bias the output. Specifically, they can:

1. Enumerate candidate `customSeed` values.
2. Compute `SHA-256(requestId_bytes || customSeed_bytes)` locally for each candidate.
3. Select the `customSeed` that produces the most favourable output.

This is a **grinding attack**. Its effectiveness is bounded by:

- The number of candidates the attacker can evaluate before the transaction is submitted.
- SHA-256 preimage resistance (2^256 work to find a specific output).

In practice, an attacker can bias the output by evaluating O(2^k) candidates to gain k bits of advantage. For a 32-byte (256-bit) output space, this is significant if the attacker has time to grind.

### What a caller cannot do

- **Produce an arbitrary output**: The oracle's `requestId`-based entropy is always included in the hash input. A caller cannot produce a specific target output without finding a SHA-256 preimage, which is computationally infeasible.
- **Bypass the oracle**: The oracle always mixes in `requestId`, so the caller cannot control the output without the oracle's participation.

## Recommendations

### Commit-reveal for `requestId`

**The most important mitigation**: ensure `requestId` is generated **on-chain after** the custom seed is committed. The recommended flow is:

1. Caller commits a hash of their seed on-chain (e.g., `SHA-256(customSeed || nonce)`).
2. The contract generates `requestId` after the commitment is recorded.
3. Caller reveals `customSeed`; the contract verifies it matches the commitment before emitting the event.

This prevents the caller from knowing `requestId` when choosing `customSeed`, eliminating the grinding attack.

### Use custom seeds only for low-stakes raffles

Custom seeds are only mixed into the PRNG path (prize < 500 XLM). High-stakes raffles use VRF, which ignores `customSeed` entirely.

### Audit trail

Every reveal that uses a custom seed records `custom_seed` in the audit log alongside `request_id`, `seed`, `proof`, and `tx_hash`. This allows independent verification that the mixing was performed correctly.

## Summary

| Threat | Mitigated? | Notes |
|---|---|---|
| Caller controls output entirely | ✅ Yes | `requestId` always included in mix |
| Caller biases output via grinding | ⚠️ Partial | Mitigated by commit-reveal for `requestId` |
| Oracle controls output entirely | ✅ Yes | Caller's `customSeed` is always included when provided |
| Replay / non-determinism | ✅ Yes | SHA-256 is deterministic; audit log enables verification |
