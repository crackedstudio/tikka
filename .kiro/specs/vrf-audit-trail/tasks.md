# Implementation Plan: VRF Audit Trail

## Overview

Implement a persistent, tamper-detectable audit log for the oracle's commit-reveal randomness scheme. The work is scoped entirely to the `oracle` NestJS application and a new Supabase migration. Tasks proceed from schema → service → controller → worker integration → tests.

## Tasks

- [x] 1. Create the database migration for `vrf_audit_log`
  - Write `oracle/database/migrations/008_vrf_audit_log.sql` with the full table DDL, indexes, RLS enablement, and public SELECT policy as specified in the design
  - Include `BIGSERIAL PRIMARY KEY`, `UNIQUE` on `raffle_id`, `CHECK` constraint on `status`, `committed_at TIMESTAMPTZ NOT NULL`, and `chain_hash TEXT NOT NULL`
  - Add indexes on `raffle_id` and `committed_at DESC`
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 2. Define shared types for the audit module
  - Create `oracle/src/audit/audit.types.ts` exporting `AuditStatus`, `VrfAuditRecord`, `CreateCommitParams`, and `UpdateRevealParams` interfaces exactly as specified in the design
  - _Requirements: 1.1, 2.1, 6.1_

- [ ] 3. Implement `AuditLogService` core — Supabase provider and hash helpers
  - [x] 3.1 Create `oracle/src/audit/supabase.provider.ts` following the same pattern as `backend/src/services/supabase.provider.ts`, reading `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` via `ConfigService`
    - _Requirements: 1.1_
  - [x] 3.2 Create `oracle/src/audit/audit-log.service.ts` with the two pure helper methods:
    - `computeRevealHash(secret, nonce, seed, proof)` — SHA-256 over `secret || nonce || seed || proof`
    - `computeChainHash(record, previousChainHash)` — SHA-256 over the canonical field concatenation defined in the design
    - _Requirements: 2.2, 1.4, 5.1_
  - [ ]* 3.3 Write property test for `computeRevealHash`
    - **Property 2: Reveal hash computation**
    - **Validates: Requirements 2.2**
    - Use `fast-check` with arbitrary `(secret, nonce, seed, proof)` strings; assert result equals independent `crypto.createHash('sha256')` computation and is deterministic
  - [ ]* 3.4 Write property test for `computeChainHash`
    - **Property 3: Chain hash computation**
    - **Validates: Requirements 1.4, 5.1**
    - Use `fast-check` with arbitrary record fields and `previousChainHash`; assert result equals independent SHA-256 computation and is deterministic

- [ ] 4. Implement `AuditLogService` write methods
  - [x] 4.1 Implement `getPreviousChainHash(beforeId?)` — selects the `chain_hash` of the record with the largest `id` less than `beforeId`, or returns `"GENESIS"` when no prior record exists
    - _Requirements: 1.4, 5.2_
  - [x] 4.2 Implement `createCommitRecord(params)` — calls `getPreviousChainHash`, computes `chain_hash` with commit-time fields (reveal fields as empty strings), and INSERTs into `vrf_audit_log`
    - _Requirements: 1.1, 1.4_
  - [x] 4.3 Implement `updateRevealRecord(params)` — computes `reveal_hash`, fetches the record's own `id` to recompute `chain_hash` with all final fields, and UPDATEs the row; if no row exists, logs WARN and INSERTs a new record with `status = 'revealed'`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 4.4 Implement `markAbandoned(raffleId)` — UPDATEs `status = 'abandoned'` and sets `revealed_at` to current UTC timestamp
    - _Requirements: 3.1_
  - [ ]* 4.5 Write property test for audit record round-trip
    - **Property 1: Audit record round-trip**
    - **Validates: Requirements 1.1, 2.1**
    - Use `fast-check` with arbitrary `(raffleId, commitmentHash, oraclePublicKey, requestId, seed, proof, ledgerSequence)`; mock Supabase client in-memory; assert `getByRaffleId` returns all fields with `status = 'revealed'` and non-null `reveal_hash`
  - [ ]* 4.6 Write property test for abandoned record marking
    - **Property 6: Abandoned record marking**
    - **Validates: Requirements 3.1**
    - Use `fast-check` with arbitrary `raffleId`; assert that after `markAbandoned`, stored record has `status = 'abandoned'` and non-null `revealed_at`

- [ ] 5. Implement `AuditLogService` read and verify methods
  - [x] 5.1 Implement `getByRaffleId(raffleId)` — SELECTs the record for the given `raffle_id`, returns `null` if not found
    - _Requirements: 4.2_
  - [x] 5.2 Implement `verifyChain(fromId?)` — iterates all records in insertion order from `fromId` (or beginning), recomputes each `chain_hash` from stored fields and the previous record's `chain_hash`, returns `true` if all match, `false` otherwise
    - _Requirements: 5.3, 5.4_
  - [ ]* 5.3 Write property test for chain integrity across sequences
    - **Property 4: Chain integrity across sequences**
    - **Validates: Requirements 5.3**
    - Use `fast-check` to generate sequences of commit+reveal calls; assert every consecutive pair satisfies the chain hash linkage invariant
  - [ ]* 5.4 Write property test for `verifyChain` tamper detection
    - **Property 5: verifyChain detects tampering**
    - **Validates: Requirements 5.4**
    - Use `fast-check`; assert `verifyChain()` returns `true` on a valid chain and `false` when any record's `chain_hash` is mutated

- [x] 6. Checkpoint — Ensure all service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement `AuditController` and `AuditLogModule`
  - [x] 7.1 Create `oracle/src/audit/audit.controller.ts` with `GET /oracle/audit/:raffleId`
    - Validate `raffleId` is a positive integer; return HTTP 400 `{ "error": "Invalid raffleId" }` otherwise
    - Return HTTP 404 `{ "error": "Audit record not found" }` when `getByRaffleId` returns `null`
    - Return the full `VrfAuditRecord` on success; no authentication required
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [x] 7.2 Create `oracle/src/audit/audit.module.ts` importing `KeysModule`, providing `AuditLogService` and `SupabaseProvider`, registering `AuditController`, and exporting `AuditLogService`
    - _Requirements: 1.1, 4.1_
  - [ ]* 7.3 Write property test for audit endpoint response completeness
    - **Property 8: Audit endpoint response completeness**
    - **Validates: Requirements 4.2, 4.5**
    - Use `fast-check` with arbitrary `VrfAuditRecord`; mock `AuditLogService`; assert response contains all required fields and does NOT contain `secret` or `nonce`
  - [ ]* 7.4 Write property test for invalid raffleId rejection
    - **Property 9: Invalid raffleId rejected with 400**
    - **Validates: Requirements 4.4**
    - Use `fast-check` with arbitrary non-positive-integer values (strings, zero, negatives, floats); assert HTTP 400 with `{ "error": "Invalid raffleId" }`
  - [ ]* 7.5 Write unit test for 404 response
    - Test that `GET /oracle/audit/:raffleId` returns 404 when `getByRaffleId` returns `null`
    - _Requirements: 4.3_

- [ ] 8. Wire `AuditLogModule` into `QueueModule` and `AppModule`
  - [x] 8.1 Add `AuditLogModule` to the `imports` array of `oracle/src/queue/queue.module.ts`
    - _Requirements: 1.1, 2.1_
  - [x] 8.2 Add `AuditLogModule` to the `imports` array of `oracle/src/app.module.ts`
    - _Requirements: 4.1_

- [ ] 9. Integrate `AuditLogService` into `CommitRevealWorker`
  - [x] 9.1 Inject `AuditLogService` into `CommitRevealWorker` and add the `try/catch` audit call in `processCommit` after `txSubmitter.submitCommitment` succeeds, as specified in the design
    - _Requirements: 1.1, 1.3_
  - [x] 9.2 Add the `try/catch` audit call in `processReveal` after `txSubmitter.submitReveal` succeeds, as specified in the design
    - _Requirements: 2.1, 2.5_
  - [ ]* 9.3 Write unit tests for `CommitRevealWorker` audit integration
    - Test that audit write failure in `processCommit` is logged and does not propagate
    - Test that audit write failure in `processReveal` is logged and does not propagate
    - _Requirements: 1.3, 2.5_
  - [ ]* 9.4 Write property test for abandonment eligibility
    - **Property 7: Abandonment eligibility**
    - **Validates: Requirements 3.3**
    - Use `fast-check` with arbitrary sets of records with varying `committed_at` timestamps and a configured timeout `T`; assert eligible set equals records where `status = 'committed'` AND `committed_at < now() - T`

- [x] 10. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests use `fast-check` (add as a dev dependency to the oracle package: `pnpm add -D fast-check`)
- Each property test runs a minimum of 100 iterations
- Audit writes in the worker are fire-and-forget: errors are caught, logged, and never propagate to fail the underlying transaction
- The `secret` and `nonce` values are never stored; only `reveal_hash` is persisted
