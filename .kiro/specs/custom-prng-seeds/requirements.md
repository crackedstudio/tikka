# Requirements Document

## Introduction

Certain raffles need to supply their own entropy (a "custom seed") at the time they request randomness, so that the resulting randomness is derived from both the oracle's internal entropy and the raffle-provided seed. This feature updates the Soroban contract to emit an optional `seed` field in the `RandomnessRequested` event, updates the oracle's `PrngService` to mix that seed into its derivation, and documents the security implications of user-provided entropy.

## Glossary

- **Oracle**: The NestJS service (`oracle/`) that listens for on-chain events and submits randomness to the Soroban contract.
- **PrngService**: The oracle service (`oracle/src/randomness/prng.service.ts`) that derives a deterministic seed and proof for low-stakes raffles.
- **CustomSeed**: An optional caller-supplied byte string (up to 32 bytes) included in the `RandomnessRequested` event and mixed into the PRNG derivation.
- **RequestId**: The unique identifier emitted by the contract in the `RandomnessRequested` event, used as the primary entropy input to `PrngService`.
- **EntropyMix**: The combined hash input formed by concatenating `RequestId` bytes with `CustomSeed` bytes before hashing.
- **RandomnessRequested**: The Soroban contract event emitted when a raffle requests randomness; it carries `raffle_id`, `request_id`, and optionally `seed`.
- **EventListenerService**: The oracle component that parses `RandomnessRequested` events from the Horizon SSE stream.
- **RandomnessJobPayload**: The Bull queue message passed from `EventListenerService` to `RandomnessWorker`.
- **Soroban_Contract**: The on-chain smart contract deployed on the Stellar network that emits `RandomnessRequested` and receives randomness reveals.

---

## Requirements

### Requirement 1: Contract Event — Optional Seed Field

**User Story:** As a raffle operator, I want to supply my own entropy when requesting randomness, so that the final seed is influenced by data I control.

#### Acceptance Criteria

1. THE Soroban_Contract SHALL accept an optional `seed: Option<BytesN<32>>` parameter in the `request_randomness` entry point.
2. WHEN `request_randomness` is called with a non-null `seed`, THE Soroban_Contract SHALL include the `seed` value in the `RandomnessRequested` event payload.
3. WHEN `request_randomness` is called without a `seed` (or with `None`), THE Soroban_Contract SHALL emit the `RandomnessRequested` event without a `seed` field, preserving backward compatibility with existing callers.
4. THE Soroban_Contract SHALL enforce that the `seed` parameter, when present, is exactly 32 bytes (`BytesN<32>`).

---

### Requirement 2: Event Parsing — Seed Extraction

**User Story:** As an oracle operator, I want the oracle to read the optional seed from the `RandomnessRequested` event, so that it can be forwarded to the PRNG derivation step.

#### Acceptance Criteria

1. WHEN the EventListenerService receives a `RandomnessRequested` event containing a `seed` field, THE EventListenerService SHALL decode the `seed` value as a 32-byte hex string and include it in the `RandomnessJobPayload`.
2. WHEN the EventListenerService receives a `RandomnessRequested` event without a `seed` field, THE EventListenerService SHALL set `customSeed` to `undefined` in the `RandomnessJobPayload`, preserving existing behaviour.
3. IF the `seed` field in the event cannot be decoded as a valid 32-byte value, THEN THE EventListenerService SHALL log a warning at `WARN` level, set `customSeed` to `undefined`, and continue processing the job.

---

### Requirement 3: PRNG Derivation — Entropy Mixing

**User Story:** As a raffle operator, I want the oracle to combine my provided seed with its own entropy, so that neither party alone controls the final randomness output.

#### Acceptance Criteria

1. WHEN `PrngService.compute` is called with a non-undefined `customSeed`, THE PrngService SHALL derive the seed as `SHA-256( requestId_bytes || customSeed_bytes [|| raffleId_u32_BE] )`.
2. WHEN `PrngService.compute` is called without a `customSeed` (or with `undefined`), THE PrngService SHALL use the existing derivation `SHA-256( requestId_bytes [|| raffleId_u32_BE] )`, preserving backward compatibility.
3. THE PrngService SHALL NOT alter the proof derivation when a `customSeed` is present; the proof SHALL remain `SHA-256("PRNG:v1:1:" || requestId_bytes) || SHA-256("PRNG:v1:2:" || requestId_bytes)`.
4. THE PrngService SHALL accept `customSeed` as a hex-encoded string of exactly 64 hex characters (32 bytes) and decode it to a `Buffer` before mixing.
5. IF `customSeed` is provided but is not a valid 64-character hex string, THEN THE PrngService SHALL throw an `Error` with a descriptive message and SHALL NOT produce a seed or proof.
6. FOR ALL valid `requestId` and `customSeed` pairs, calling `PrngService.compute` twice with the same inputs SHALL return identical `seed` and `proof` values (determinism / round-trip property).

---

### Requirement 4: Worker — Propagation of Custom Seed

**User Story:** As an oracle operator, I want the custom seed to flow from the queue job through to the PRNG computation, so that no data is lost between event ingestion and randomness derivation.

#### Acceptance Criteria

1. THE RandomnessWorker SHALL read `customSeed` from the `RandomnessJobPayload` and pass it to `PrngService.compute` when the selected method is `PRNG`.
2. WHEN the selected method is `VRF`, THE RandomnessWorker SHALL ignore `customSeed` and SHALL NOT pass it to `VrfService`.
3. THE RandomnessWorker SHALL include `customSeed` in the `RevealItem` stored in the `BatchCollector`, so that it is available for audit logging.

---

### Requirement 5: Audit Logging — Custom Seed Traceability

**User Story:** As an auditor, I want the custom seed to appear in the audit log, so that the full entropy inputs for each reveal are traceable.

#### Acceptance Criteria

1. WHEN a reveal that used a `customSeed` is successfully submitted, THE AuditLoggerService SHALL persist the `customSeed` value alongside the existing `raffle_id`, `request_id`, `seed`, `proof`, `tx_hash`, and `method` fields.
2. WHEN a reveal did not use a `customSeed`, THE AuditLoggerService SHALL record `customSeed` as `null` in the audit log entry.

---

### Requirement 6: Bias and Security Documentation

**User Story:** As a security reviewer, I want the security implications of user-provided entropy to be documented, so that operators can make informed decisions about enabling custom seeds.

#### Acceptance Criteria

1. THE Oracle SHALL include a `SECURITY.md` document in the `oracle/` directory that describes the entropy-mixing scheme, the bias analysis of user-provided seeds, and the conditions under which a malicious caller could influence (but not fully control) the output.
2. THE `SECURITY.md` SHALL state that a caller who knows `requestId` in advance can choose a `customSeed` to bias the output within the bounds of the SHA-256 preimage resistance, and SHALL recommend that `requestId` be generated on-chain after the seed is committed.
3. THE `SECURITY.md` SHALL document that the oracle's `requestId`-based entropy is always included in the mix, so a caller cannot produce an arbitrary output even with a chosen `customSeed`.
