# Requirements Document

## Introduction

The VRF Commit-Reveal Audit Trail feature adds a persistent, tamper-detectable audit log for every VRF randomness computation performed by the oracle. Currently, the `CommitRevealWorker` performs a two-phase commit-reveal scheme but discards all intermediate state after a successful reveal, making post-hoc auditability impossible.

This feature introduces a `vrf_audit_log` PostgreSQL table that is written during the commit phase and updated during the reveal phase. A SHA-256 chain hash links consecutive records so that any tampering with historical entries is detectable. A public HTTP endpoint exposes the full audit record for a given raffle, enabling participants and third parties to independently verify the integrity of every draw.

## Glossary

- **Audit_Log_Service**: The NestJS service responsible for reading and writing `vrf_audit_log` records.
- **Audit_Controller**: The NestJS HTTP controller that exposes the public audit endpoint.
- **CommitRevealWorker**: The existing worker that orchestrates the two-phase commit-reveal process for a raffle draw.
- **Chain_Hash**: A SHA-256 digest computed over all fields of the current audit record concatenated with the chain hash of the immediately preceding record, forming a tamper-detectable chain.
- **Commitment_Hash**: The SHA-256 digest of `secret || nonce` produced during the commit phase, as computed by `CommitmentService`.
- **Reveal_Hash**: The SHA-256 digest of `secret || nonce || seed || proof` produced during the reveal phase.
- **Oracle_Public_Key**: The Ed25519 public key of the oracle that signed the VRF proof, retrievable from `KeyService`.
- **Abandoned_Record**: An audit record whose draw timed out before the reveal phase completed, marked with `status = 'abandoned'`.
- **vrf_audit_log**: The PostgreSQL table storing one record per raffle draw attempt.
- **Supabase**: The managed PostgreSQL service used by this project, accessed via the existing `supabase.provider.ts` pattern.

## Requirements

### Requirement 1: Persist Audit Record on Commit

**User Story:** As an auditor, I want every commit phase to produce a persisted audit record, so that I can trace the origin of every draw's randomness commitment.

#### Acceptance Criteria

1. WHEN `CommitRevealWorker.processCommit` successfully submits a commitment to the contract, THE `Audit_Log_Service` SHALL insert a new record into `vrf_audit_log` containing: `raffle_id`, `request_id` (null at commit time), `commitment_hash`, `oracle_public_key`, `committed_at` (current UTC timestamp), and `status = 'committed'`.
2. THE `vrf_audit_log` table SHALL enforce a unique constraint on `raffle_id` to prevent duplicate audit records for the same raffle.
3. IF the `Audit_Log_Service` fails to insert the audit record, THEN THE `CommitRevealWorker` SHALL log the error and continue without failing the commit transaction.
4. THE `Audit_Log_Service` SHALL compute the `chain_hash` for each new record as `SHA-256(raffle_id || commitment_hash || oracle_public_key || committed_at || previous_chain_hash)`, where `previous_chain_hash` is the `chain_hash` of the record with the highest `id` value inserted before the current record, or a fixed genesis string `"GENESIS"` if no prior record exists.

### Requirement 2: Update Audit Record on Reveal

**User Story:** As an auditor, I want the reveal phase to update the existing audit record with the reveal data, so that I have a complete, linked record of both phases for every draw.

#### Acceptance Criteria

1. WHEN `CommitRevealWorker.processReveal` successfully submits the reveal to the contract, THE `Audit_Log_Service` SHALL update the existing `vrf_audit_log` record for the given `raffle_id` with: `request_id`, `reveal_hash`, `proof`, `seed`, `revealed_at` (current UTC timestamp), `ledger_sequence`, and `status = 'revealed'`.
2. THE `Audit_Log_Service` SHALL compute `reveal_hash` as `SHA-256(secret || nonce || seed || proof)` before storing it, so that the raw secret and nonce are never persisted.
3. THE `Audit_Log_Service` SHALL recompute and update `chain_hash` after the reveal fields are populated, incorporating all final record fields.
4. IF no existing `vrf_audit_log` record is found for the given `raffle_id` during the reveal phase, THEN THE `Audit_Log_Service` SHALL log a warning and insert a new record with the available reveal data and `status = 'revealed'`.
5. IF the `Audit_Log_Service` fails to update the audit record during reveal, THEN THE `CommitRevealWorker` SHALL log the error and continue without failing the reveal transaction.

### Requirement 3: Record Abandoned Draws

**User Story:** As an auditor, I want timed-out or failed draws to be recorded in the audit log, so that the audit trail is complete even for draws that never completed the reveal phase.

#### Acceptance Criteria

1. WHEN a draw times out or is abandoned before the reveal phase completes, THE `Audit_Log_Service` SHALL update the corresponding `vrf_audit_log` record to `status = 'abandoned'` and set `revealed_at` to the current UTC timestamp.
2. THE `vrf_audit_log` table SHALL enforce that `status` is one of: `'committed'`, `'revealed'`, `'abandoned'`.
3. WHILE a record has `status = 'committed'` and `committed_at` is older than the configured draw timeout, THE `Audit_Log_Service` SHALL treat the record as eligible for abandonment marking.

### Requirement 4: Public Audit Endpoint

**User Story:** As a raffle participant, I want to query a public endpoint with a raffle ID and receive the full audit record, so that I can independently verify the integrity of the draw.

#### Acceptance Criteria

1. THE `Audit_Controller` SHALL expose a `GET /oracle/audit/:raffleId` endpoint that requires no authentication.
2. WHEN a valid `raffleId` is provided and a matching record exists, THE `Audit_Controller` SHALL return a JSON response containing: `id`, `raffle_id`, `request_id`, `commitment_hash`, `reveal_hash`, `proof`, `seed`, `oracle_public_key`, `status`, `committed_at`, `revealed_at`, `ledger_sequence`, and `chain_hash`.
3. WHEN a `raffleId` is provided that does not match any record, THE `Audit_Controller` SHALL return HTTP 404 with a JSON body `{ "error": "Audit record not found" }`.
4. WHEN a `raffleId` is provided that is not a positive integer, THE `Audit_Controller` SHALL return HTTP 400 with a JSON body `{ "error": "Invalid raffleId" }`.
5. THE `Audit_Controller` SHALL NOT expose the raw `secret` or `nonce` values in any response.

### Requirement 5: Chain Hash Integrity

**User Story:** As an auditor, I want consecutive audit records to be linked by a chain hash, so that I can detect if any historical record has been tampered with.

#### Acceptance Criteria

1. THE `Audit_Log_Service` SHALL compute `chain_hash` as `SHA-256` over the concatenation of the following fields in order: `raffle_id`, `commitment_hash`, `reveal_hash` (empty string if not yet set), `proof` (empty string if not yet set), `seed` (empty string if not yet set), `oracle_public_key`, `status`, `committed_at` (ISO 8601 string), and the `chain_hash` of the immediately preceding record (or `"GENESIS"` for the first record).
2. THE `Audit_Log_Service` SHALL determine the preceding record by selecting the record with the largest `id` value that was inserted before the current record.
3. FOR ALL consecutive pairs of audit records `(R_n, R_{n+1})`, verifying `R_{n+1}.chain_hash` by recomputing it from `R_{n+1}`'s fields and `R_n.chain_hash` SHALL produce the same value as the stored `chain_hash`.
4. THE `Audit_Log_Service` SHALL expose a `verifyChain(fromId?: number): Promise<boolean>` method that iterates all records in insertion order and returns `true` if every chain hash is valid, `false` otherwise.

### Requirement 6: Database Schema

**User Story:** As a developer, I want a well-defined database schema for the audit log, so that the data is structured, indexed, and queryable.

#### Acceptance Criteria

1. THE `vrf_audit_log` table SHALL contain the following columns: `id` (BIGSERIAL PRIMARY KEY), `raffle_id` (INTEGER NOT NULL UNIQUE), `request_id` (TEXT), `commitment_hash` (TEXT NOT NULL), `reveal_hash` (TEXT), `proof` (TEXT), `seed` (TEXT), `oracle_public_key` (TEXT NOT NULL), `status` (TEXT NOT NULL), `committed_at` (TIMESTAMPTZ NOT NULL), `revealed_at` (TIMESTAMPTZ), `ledger_sequence` (INTEGER), `chain_hash` (TEXT NOT NULL).
2. THE migration script SHALL create indexes on `raffle_id` and `committed_at DESC` to support efficient lookups by raffle and time-range queries.
3. THE migration script SHALL enable Row Level Security on `vrf_audit_log` and add a policy permitting public `SELECT` access, consistent with the public nature of the audit endpoint.
