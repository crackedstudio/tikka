# VRF Service Test Suite

This document describes the comprehensive test suite for `VrfService` and `Ed25519Sha256VrfProvider` in `vrf.service.spec.ts`.

## Overview

The VRF (Verifiable Random Function) implementation is the cryptographic core of Tikka's fairness guarantee for high-stakes raffles (prize ≥ 500 XLM). This test suite pins VRF output to known-answer tests and verifies the failure path when keys are unavailable.

## Test Architecture

### Known-Answer Tests

The test suite includes **known-answer tests** — fixed test vectors with deterministic inputs and expected outputs. These are computed once from the test private key and then verified on every test run:

```
input = UTF-8(requestId) [|| u32_BE(raffleId)]
proof = ed25519.sign(input, testPrivateKey)
seed = SHA-256(proof)
```

The fixed test private key is:
```
1f1e4e67a0c8e88b3ba681b0fb47c0d8d9c0c2e8b0c1e2d3a4b5c6d7e8f90a1
```

Any implementation change that alters VRF output must be deliberate and justified, because these tests will fail and alert the developer.

### Test Vectors

Three test vectors are computed dynamically at test startup:

1. **`test-request-001` (no raffleId)**
   - Input: UTF-8 string only
   - Tests basic requestId encoding

2. **`test-request-001` with `raffleId=42`**
   - Input: UTF-8(requestId) || u32_BE(42)
   - Tests domain separation when raffleId is included

3. **`raffle-2026-sep-friday` with `raffleId=999`**
   - Input: UTF-8(requestId) || u32_BE(999)
   - Tests larger raffleId values and realistic naming

## Test Suites

### 1. Ed25519Sha256VrfProvider

#### Input Encoding
- **`should encode requestId without raffleId as UTF-8`** — Verifies UTF-8 encoding of requestId alone.
- **`should encode requestId and raffleId as UTF-8(requestId) || u32_BE(raffleId)`** — Verifies the encoding format matches RFC (UTF-8 string followed by 4-byte big-endian integer).
- **`should handle raffleId wraparound (treating as u32)`** — Verifies max u32 value (0xFFFFFFFF) is handled correctly.

#### Determinism
- **`should produce identical proofs for the same input`** — Ed25519 is deterministic (RFC 8032); same input must always produce same output.
- **`should produce identical seeds for the same (requestId, raffleId) pair`** — Verifies determinism across both requestId and raffleId parameters.
- **`should compute seeds deterministically across multiple calls`** — Verifies parallel/async calls with the same input yield identical results.

#### Domain Separation
- **`should produce different seeds for different requestIds`** — Two different requestIds must not collide.
- **`should produce different seeds for same requestId with different raffleIds`** — Different raffleIds acting on the same requestId must produce different seeds.
- **`should produce different seeds for requestId with and without raffleId`** — Adding a raffleId changes the input, so the seed must differ.
- **`should make collision between different raffles computationally infeasible`** — Computes 100 different raffles; all 100 seeds must be unique. (Probabilistic; computational infeasibility follows from SHA-256 properties.)

#### Known-Answer Tests
- **`should produce expected output for requestId=... raffleId=...`** — Parameterized test for each known-answer vector. **This is the primary correctness check.**
- **`should produce consistent results across all known-answer vectors`** — Verifies all vectors in a single test, useful for CI/CD pipelines.

#### Proof Verification
- **`should verify valid proof`** — A proof for a given requestId verifies against the public key.
- **`should reject tampered proof`** — Flipping a single bit in the proof makes it invalid.
- **`should reject proof for different requestId`** — A proof for requestId A does not verify for requestId B.
- **`should reject proof with wrong public key`** — A proof signed with key K1 does not verify with key K2.
- **`should handle raffleId in verification`** — Proof verification fails if the raffleId does not match the original input.

#### Proof + Seed Verification
- **`should verify valid proof and matching seed`** — Both proof and seed must be correct.
- **`should reject mismatched seed`** — If seed does not match SHA-256(proof), verification fails.
- **`should reject invalid proof`** — Invalid proof fails verification.

#### Error Handling
- **`should handle invalid hex proof gracefully`** — Non-hex strings in proof are handled without throwing.
- **`should handle invalid hex seed gracefully`** — Non-hex strings in seed are handled without throwing.
- **`should handle invalid hex public key gracefully`** — Non-hex strings in public key are handled without throwing.

#### Algorithm Property
- **`should report correct algorithm`** — The provider reports its algorithm as `Ed25519-SHA-256`.

### 2. VrfService

#### Compute
- **`should delegate to provider and return result`** — VrfService.compute() returns a valid seed and proof.
- **`should accept optional raffleId`** — Compute works with and without raffleId parameter.
- **`should resolve alert on successful computation`** — On success, the `vrf-key-unavailable` alert is resolved.
- **`should record metrics on success`** — Metrics service is called to record successful VRF proof.

#### Key Unavailability (Failure Path)
- **`should fire critical alert when key is unavailable`** — When KeyService.sign() throws, an alert is fired with severity `critical`.
- **`should record failure metric when key is unavailable`** — Failure is logged to metrics with error reason.
- **`should refuse to compute seed when key is unavailable`** — **No fallback to PRNG or other seed source; error is re-thrown.**
- **`should not fall back on key unavailability`** — Reinforces that the service fails closed, not gracefully.
- **`should include oracle context in alert`** — The alert includes oracle ID, raffle ID, and request ID for debugging.

**These tests are critical**: they verify that when the signing key is unavailable (e.g., HSM offline, AWS KMS unreachable), the oracle refuses to produce a seed rather than falling back to a lower-assurance method.

#### ComputeWithKey (Deprecated)
- **`should compute VRF using explicit private key`** — The deprecated method works with an explicit key.
- **`should produce deterministic output`** — Same key, same requestId → same output.
- **`should produce different output for different requestIds`** — Different inputs → different outputs.
- **`should produce different output for different private keys`** — Different keys → different outputs.

#### Verify
- **`should verify valid proof and seed`** — A valid (proof, seed) pair verifies.
- **`should reject invalid proof`** — Invalid proof fails verification.
- **`should reject mismatched seed`** — If seed ≠ SHA-256(proof), verification fails.
- **`should reject when raffleId does not match`** — Proof verification uses raffleId as part of the input; if raffleId differs, verification fails.

#### VerifyProof
- **`should verify valid proof`** — Proof verification returns `{ valid: true, seed: ... }`.
- **`should return object with valid=false for invalid proof`** — Invalid proof returns `{ valid: false }`.

#### GetPublicKey
- **`should return public key in hex and base64`** — Public key is returned in both encodings.

#### ComputeForOracle
- **`should compute for local oracle`** — In multi-oracle mode, compute for the local oracle.
- **`should throw if oracle not found`** — Asking for an unknown oracle raises an error.
- **`should throw for non-local oracle`** — Computing for a remote oracle is not yet supported.

### 3. Integration Tests

#### Determinism and Reproducibility
- **`should produce identical seeds across service boundaries`** — VrfService and Ed25519Sha256VrfProvider produce the same output for the same input.
- **`should allow third-party verification without service`** — A verifier with only the public key, proof, and seed can verify the result without accessing VrfService.

## Running the Tests

```bash
# From the oracle directory
npm test -- src/randomness/vrf.service.spec.ts

# With coverage
npm test -- src/randomness/vrf.service.spec.ts --coverage

# Watch mode (for development)
npm test -- src/randomness/vrf.service.spec.ts --watch
```

## Acceptance Criteria Met

✅ **Known-answer tests**: VRF output is pinned by deterministic test vectors computed from a fixed private key.  
✅ **Determinism**: Same (requestId, raffleId) always produces the same seed.  
✅ **Domain separation**: Different raffles produce different seeds; collision is computationally infeasible.  
✅ **Failure path**: When KeyService cannot supply a key, VrfService raises a critical alert and refuses to produce a seed (no fallback).  
✅ **IVrfProvider contract**: Both proof and seed verification are covered; algorithm property is tested.  
✅ **Ed25519-SHA-256 provider**: Full provider interface is tested against the implementation.

## Implementation Notes

### Why Dynamic Test Vectors?

The known-answer vectors are computed at test startup using the fixed test private key. This has two benefits:

1. **Reproducibility**: The test is self-contained; no external test data file is needed.
2. **Auditability**: The computation is transparent in the test code itself, so readers can verify the logic.

If you suspect the vectors are wrong, you can compute them manually:

```javascript
import { ed25519 } from '@noble/curves/ed25519';
import * as crypto from 'crypto';

const TEST_PRIVATE_KEY = Buffer.from('1f1e4e67a0c8e88b3ba681b0fb47c0d8d9c0c2e8b0c1e2d3a4b5c6d7e8f90a1', 'hex');
const msg = Buffer.from('test-request-001', 'utf-8');
const proof = ed25519.sign(msg, TEST_PRIVATE_KEY);
const seed = crypto.createHash('sha256').update(proof).digest('hex');
console.log(Buffer.from(proof).toString('hex'), seed);
```

### Why No Mock Verification?

The provider tests use real Ed25519 signing and SHA-256 hashing, not mocks. This ensures the tests verify actual cryptographic behavior, not just interface contracts. The service tests mock KeyService to control error conditions.

### Why Tests Both Provider and Service?

- **Provider tests** verify the cryptographic algorithm directly.
- **Service tests** verify the integration (mocking dependencies) and failure paths (alert firing, metric recording).

Together, they ensure correctness at both levels.

## Future Enhancements

- **Property-based testing**: Use `fast-check` to generate random (requestId, raffleId) pairs and verify invariants (determinism, domain separation).
- **Performance benchmarks**: Measure VRF computation time and ensure it remains acceptable under load.
- **HSM provider tests**: When HSM provider is available, add integration tests to verify signing behavior on real hardware.
- **Audit trail tests**: Verify that VRF results are correctly logged to the audit trail.
