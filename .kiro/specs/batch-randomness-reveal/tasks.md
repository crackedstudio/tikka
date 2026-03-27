# Implementation Plan: batch-randomness-reveal

## Overview

Implement batch randomness reveal by introducing a `BatchCollector` service, updating `TxSubmitterService` with a `submitBatch` method, wiring the updated `RandomnessWorker`, extending `HealthService` with batch counters, adding a `receive_randomness_batch` entry point to the Soroban contract, and covering all 18 correctness properties with fast-check property tests and Soroban contract tests.

## Tasks

- [x] 1. Environment configuration — BATCH_SIZE and BATCH_WINDOW_MS
  - Add `BATCH_SIZE` (default `5`) and `BATCH_WINDOW_MS` (default `2000`) to the NestJS `ConfigService` / env schema in `oracle/src/config/`.
  - Emit `Logger.warn` and fall back to defaults when `BATCH_SIZE < 1` or `BATCH_WINDOW_MS < 0`.
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 1.1 Write property tests for configuration validation
    - **Property 1: Configuration defaults are applied when env vars are absent**
    - **Validates: Requirements 1.1, 1.2**
    - **Property 2: Invalid configuration falls back to defaults**
    - **Validates: Requirements 1.3, 1.4**
    - Use `fc.constant(undefined)` and `fc.integer({max: 0})` / `fc.integer({max: -1})` arbitraries.

- [x] 2. Define shared TypeScript interfaces
  - Create `oracle/src/queue/batch-reveal.types.ts` exporting `RevealItem`, `BatchSubmitResult`, and `BatchFlushResult`.
  - _Requirements: 2.1, 3.4_

- [x] 3. Implement BatchCollector service
  - Create `oracle/src/queue/batch-collector.service.ts` as an `@Injectable()` NestJS service.
  - Inject `ConfigService`; read `BATCH_SIZE` and `BATCH_WINDOW_MS` with validated defaults.
  - Implement `add(item: RevealItem): void` — appends to `buffer`, starts timer on first item, triggers immediate flush when `buffer.length === BATCH_SIZE`.
  - Implement `onFlush(handler): void` — registers the flush callback.
  - Guard concurrent flushes with `inFlight: boolean`; accumulate new items while `inFlight` is `true`.
  - Reset `inFlight` in a `finally` block; clear timer in `onModuleDestroy`.
  - Emit `DEBUG` log on each flush with batch size and trigger reason (`SIZE_LIMIT` | `TIMER`).
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 8.1_

  - [ ]* 3.1 Write property test — flush delivers all items and clears buffer
    - **Property 3: Flush delivers all accumulated items and clears the buffer**
    - **Validates: Requirements 2.1, 2.4**
    - Use `fc.array(revealItemArb, {minLength: 1})`.

  - [ ]* 3.2 Write property test — size-limit flush at exactly BATCH_SIZE
    - **Property 4: Size-limit flush triggers at exactly BATCH_SIZE items**
    - **Validates: Requirements 2.2**
    - Use `fc.integer({min:1,max:20})` for N and an array of N items.

  - [ ]* 3.3 Write property test — timer flush after BATCH_WINDOW_MS
    - **Property 5: Timer flush triggers after BATCH_WINDOW_MS with a non-empty buffer**
    - **Validates: Requirements 2.3**
    - Use `fc.array(revealItemArb, {minLength:1})` with Jest fake timers.

  - [ ]* 3.4 Write property test — at most one in-flight batch at a time
    - **Property 6: At most one in-flight batch at a time**
    - **Validates: Requirements 2.5**
    - Use `fc.array(revealItemArb, {minLength:2})` with a slow mock flush handler.

- [x] 4. Checkpoint — Ensure BatchCollector unit and property tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement TxSubmitterService.submitBatch
  - Add `submitBatch(items: RevealItem[]): Promise<BatchSubmitResult>` to `oracle/src/tx-submitter/tx-submitter.service.ts`.
  - If `items.length === 1`, delegate to existing `submitRandomness` and wrap result in `BatchSubmitResult`.
  - Otherwise build a Soroban transaction invoking `receive_randomness_batch` with a `Vec` of `(u32, Bytes, Bytes)` tuples in input order.
  - Simulate before submission; log simulation warnings without aborting.
  - Apply the same exponential-backoff retry loop (`MAX_RETRIES`, `INITIAL_BACKOFF_MS`) as `submitRandomness`.
  - Parse `Vec<Result<(), Error>>` from the confirmed transaction and populate per-item `success` / `errorCode` fields.
  - On total failure (retries exhausted), return `BatchSubmitResult` with all items `success: false`.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 8.4_

  - [ ]* 5.1 Write property test — batch transaction encodes all items
    - **Property 7: Batch transaction encodes all items**
    - **Validates: Requirements 3.1**
    - Use `fc.array(revealItemArb, {minLength:2})` with a mocked RPC.

  - [ ]* 5.2 Write property test — BatchSubmitResult length on success
    - **Property 8: BatchSubmitResult has one entry per input item on success**
    - **Validates: Requirements 3.4**
    - Use `fc.array(revealItemArb, {minLength:1})`.

  - [ ]* 5.3 Write property test — all items failed when retries exhausted
    - **Property 9: All items marked failed when transaction exhausts retries**
    - **Validates: Requirements 3.5, 3.6**
    - Use `fc.array(revealItemArb, {minLength:1})` with a mock RPC that always rejects.

  - [ ]* 5.4 Write property test — contract return value maps to per-item flags
    - **Property 10: Contract return value maps to per-item success flags**
    - **Validates: Requirements 4.1**
    - Use `fc.array(fc.boolean())` to generate arbitrary result vectors.

  - [ ]* 5.5 Write property test — single-item batch routes to receive_randomness
    - **Property 18: Single-item batch routes to receive_randomness**
    - **Validates: Requirements 8.4**
    - Use `fc.record(revealItemArb)` and assert `receive_randomness` is called, not `receive_randomness_batch`.

- [x] 6. Checkpoint — Ensure TxSubmitterService tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Update RandomnessWorker to use BatchCollector
  - Inject `BatchCollector` into `RandomnessWorker` (and `CommitRevealWorker` if applicable) in `oracle/src/queue/`.
  - Before calling `BatchCollector.add`, call `ContractService.isRandomnessSubmitted(raffleId)`; discard the item if it returns `true`.
  - Register a flush handler via `BatchCollector.onFlush` that:
    1. Calls `TxSubmitterService.submitBatch(items)`.
    2. For each item in `BatchSubmitResult.items`:
       - Success → calls `AuditLoggerService.log` with shared `tx_hash`, `ledger`, and item-specific fields.
       - `errorCode === 'ALREADY_FINALISED'` → discards silently.
       - Other failure → re-enqueues `raffleId` as a new Bull job.
    3. Calls `HealthService.recordBatchSubmission(batchSize, successes, failures)`.
    4. Logs batch size, `txHash`, `ledger`, success count, and failure count at `LOG` level.
  - Log each failed `RevealItem` with `raffleId` and reason at `ERROR` level.
  - _Requirements: 2.1, 4.2, 4.3, 4.4, 5.1, 5.2, 6.1, 6.2, 6.3, 8.2_

  - [ ]* 7.1 Write property test — already-submitted items filtered before batching
    - **Property 12: Already-submitted items are filtered before batching**
    - **Validates: Requirements 5.1, 5.2**
    - Use `fc.array(fc.nat())` for raffleIds with a mock `ContractService`.

  - [ ]* 7.2 Write property test — only failed non-finalised items are re-enqueued
    - **Property 11: Only failed non-finalised items are re-enqueued**
    - **Validates: Requirements 4.2, 4.3**
    - Use `fc.array(batchItemResultArb)` covering success, `ALREADY_FINALISED`, and other-failure variants.

  - [ ]* 7.3 Write property test — audit log call count matches successful items
    - **Property 13: Audit log entries match successful items exactly**
    - **Validates: Requirements 6.1, 6.3**
    - Use `fc.array(batchItemResultArb, {minLength:1})`.

  - [ ]* 7.4 Write property test — audit log entry contains all required fields
    - **Property 14: Each audit log entry contains all required fields**
    - **Validates: Requirements 6.2**
    - Use `fc.record({...})` for `RevealItem` combined with a fixed `BatchSubmitResult`.

- [x] 8. Checkpoint — Ensure RandomnessWorker tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Update HealthService with batch counters
  - Add `batchSubmissions`, `totalRevealsBatched`, and `totalBatchFailures` counters to `HealthMetrics` in `oracle/src/health/health.service.ts`.
  - Implement `recordBatchSubmission(batchSize: number, successes: number, failures: number): void` — increments all three counters atomically.
  - Expose the new counters via the existing health endpoint response.
  - _Requirements: 8.3_

  - [x]* 9.1 Write property test — health counters accurately reflect batch operations
    - **Property 17: Health counters accurately reflect batch operations**
    - **Validates: Requirements 8.3**
    - Use `fc.array(batchOpArb)` where `batchOpArb` generates `{batchSize, successes, failures}` records; assert running totals match.

- [x] 10. Register BatchCollector in AppModule
  - Add `BatchCollector` to the `providers` array in `oracle/src/app.module.ts`.
  - Ensure `ConfigModule` is available in the same module scope.
  - _Requirements: 2.1_

- [x] 11. Implement Soroban contract — receive_randomness_batch
  - Add `receive_randomness_batch(env: Env, entries: Vec<(u32, BytesN<32>, BytesN<64>)>) -> Vec<Result<(), Error>>` to the Rust contract.
  - Process entries sequentially, applying the same validation as `receive_randomness`.
  - Collect per-entry `Result` values; always return `Ok` at the transaction level even when all entries fail.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 11.1 Write contract test — single-entry batch equivalence with receive_randomness
    - **Property 15: receive_randomness_batch is equivalent to receive_randomness for single entries**
    - **Validates: Requirements 7.2**
    - Use `soroban_sdk::testutils`; generate arbitrary valid `(raffle_id, seed, proof)` triples.

  - [ ]* 11.2 Write contract test — partial failure does not abort remaining entries
    - **Property 16: Partial failure does not abort remaining entries**
    - **Validates: Requirements 7.3, 7.4**
    - Mix valid and invalid entries; assert output vector preserves input order and valid entries succeed.

  - [ ]* 11.3 Write contract test — all-invalid batch returns transaction-level Ok
    - Edge case: all entries invalid — verify transaction-level `Ok` with fully-populated error result vector.
    - **Validates: Requirements 7.5**

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Each task references specific requirements for traceability.
- Property tests use fast-check with a minimum of 100 iterations per property.
- Contract tests use `soroban_sdk::testutils` on a local test environment.
- The `inFlight` guard in `BatchCollector` must reset in a `finally` block to prevent deadlocks on unhandled exceptions.
