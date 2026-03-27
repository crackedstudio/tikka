# Requirements Document

## Introduction

Currently the oracle service submits one Soroban transaction per randomness reveal. When many raffles end simultaneously, this produces N separate transactions, each paying its own base fee and consuming its own ledger entry. This feature introduces batching: the Worker accumulates pending reveal jobs and the TxSubmitterService groups up to N of them into a single `receive_randomness_batch` contract call, reducing gas cost and ledger bloat. Partial success within a batch must be handled so that a single failed reveal does not block the rest.

## Glossary

- **Oracle**: The NestJS service (`oracle/`) that listens for raffle-end events and submits randomness to the Soroban contract.
- **Worker**: The `RandomnessWorker` (and `CommitRevealWorker`) classes that consume jobs from the Bull queue and orchestrate randomness computation and submission.
- **TxSubmitterService**: The service responsible for building, signing, simulating, and submitting Soroban transactions.
- **BatchCollector**: The new component inside the Oracle responsible for accumulating individual reveal items and flushing them as a batch.
- **Batch**: A group of up to `BATCH_SIZE` reveal items submitted together in a single Soroban transaction.
- **BATCH_SIZE**: A configurable integer (default: 5) representing the maximum number of reveals per batch transaction.
- **BATCH_WINDOW_MS**: A configurable integer (default: 2000 ms) representing the maximum time the BatchCollector waits before flushing an incomplete batch.
- **RevealItem**: A single unit of work containing a `raffleId`, `seed`, `proof`, and `method`.
- **BatchRevealResult**: The per-item outcome returned after a batch transaction, indicating success or failure for each `raffleId`.
- **Soroban Contract**: The on-chain smart contract deployed on the Stellar network that receives randomness and finalises raffles.
- **receive_randomness**: The existing single-reveal contract entry point.
- **receive_randomness_batch**: The new batch contract entry point that accepts a vector of reveal items.
- **AuditLoggerService**: The existing service that persists reveal results off-chain for transparency.

---

## Requirements

### Requirement 1: Batch Configuration

**User Story:** As an oracle operator, I want to configure the batch size and flush window, so that I can tune throughput and latency trade-offs for my deployment.

#### Acceptance Criteria

1. THE Oracle SHALL read `BATCH_SIZE` from environment configuration, defaulting to `5` when the variable is absent.
2. THE Oracle SHALL read `BATCH_WINDOW_MS` from environment configuration, defaulting to `2000` when the variable is absent.
3. IF `BATCH_SIZE` is set to a value less than `1`, THEN THE Oracle SHALL log a warning and use the default value of `5`.
4. IF `BATCH_WINDOW_MS` is set to a value less than `0`, THEN THE Oracle SHALL log a warning and use the default value of `2000`.

---

### Requirement 2: Batch Accumulation

**User Story:** As an oracle operator, I want pending reveal jobs to be grouped before submission, so that concurrent raffle endings are handled in fewer transactions.

#### Acceptance Criteria

1. THE BatchCollector SHALL accumulate RevealItems from completed randomness-computation steps before submitting them to the Soroban contract.
2. WHEN the number of accumulated RevealItems reaches `BATCH_SIZE`, THE BatchCollector SHALL immediately flush the batch without waiting for the `BATCH_WINDOW_MS` timer.
3. WHEN `BATCH_WINDOW_MS` elapses since the first item was added to a non-empty batch, THE BatchCollector SHALL flush the accumulated items even if fewer than `BATCH_SIZE` items are present.
4. WHEN a flush is triggered, THE BatchCollector SHALL pass all accumulated RevealItems to the TxSubmitterService as a single batch and clear the internal accumulation buffer.
5. THE BatchCollector SHALL process at most one in-flight batch transaction at a time per oracle instance; additional items SHALL continue to accumulate in the next batch window.

---

### Requirement 3: Batch Transaction Submission

**User Story:** As an oracle operator, I want multiple reveals submitted in one Soroban transaction, so that gas costs and ledger entries are minimised.

#### Acceptance Criteria

1. WHEN the TxSubmitterService receives a batch of RevealItems, THE TxSubmitterService SHALL build a single Soroban transaction invoking `receive_randomness_batch` with all items encoded as a vector of `(raffle_id: u32, seed: Bytes, proof: Bytes)` tuples.
2. THE TxSubmitterService SHALL simulate the batch transaction before submission and log any simulation warnings without aborting the submission.
3. THE TxSubmitterService SHALL sign the batch transaction with the oracle keypair and submit it to the Soroban RPC endpoint.
4. WHEN the batch transaction is confirmed with status `SUCCESS`, THE TxSubmitterService SHALL return a `BatchSubmitResult` containing the transaction hash, ledger number, and a per-item success flag for each `raffleId`.
5. WHEN the batch transaction fails after all retry attempts, THE TxSubmitterService SHALL return a `BatchSubmitResult` marking all items in the batch as failed.
6. THE TxSubmitterService SHALL apply the same exponential-backoff retry logic (up to `MAX_RETRIES` attempts) to batch submissions as it does to single-item submissions.

---

### Requirement 4: Partial Success Handling

**User Story:** As an oracle operator, I want individual reveal failures within a batch to be isolated, so that one bad reveal does not prevent other raffles from being finalised.

#### Acceptance Criteria

1. WHEN the Soroban contract returns per-item error codes within a successful batch transaction, THE TxSubmitterService SHALL parse the contract return value and mark each failed `raffleId` individually in the `BatchSubmitResult`.
2. WHEN a RevealItem is marked as failed in the `BatchSubmitResult`, THE Worker SHALL re-enqueue that specific `raffleId` as a new individual job for retry, without re-processing the successful items.
3. WHEN a RevealItem is marked as failed due to the raffle already being finalised on-chain, THE Worker SHALL discard that item and SHALL NOT re-enqueue it.
4. THE Worker SHALL log each failed RevealItem with its `raffleId` and the reason for failure at `ERROR` level.

---

### Requirement 5: Idempotency and Duplicate Prevention

**User Story:** As an oracle operator, I want the batch flow to skip already-finalised raffles, so that duplicate submissions are avoided even under retry conditions.

#### Acceptance Criteria

1. BEFORE adding a RevealItem to the BatchCollector, THE Worker SHALL check `ContractService.isRandomnessSubmitted` for that `raffleId`.
2. IF `ContractService.isRandomnessSubmitted` returns `true` for a `raffleId`, THEN THE Worker SHALL discard that RevealItem and SHALL NOT add it to the batch.
3. THE TxSubmitterService SHALL treat a contract-level "already finalised" error for an individual item within a batch as a non-fatal condition and SHALL continue processing the remaining items.

---

### Requirement 6: Audit Logging for Batch Reveals

**User Story:** As an auditor, I want every reveal within a batch to be individually logged, so that the transparency record is complete regardless of whether batching was used.

#### Acceptance Criteria

1. WHEN a batch transaction is confirmed, THE Worker SHALL call `AuditLoggerService.log` once for each successfully revealed `raffleId` in the batch.
2. THE AuditLogEntry for each item in a batch SHALL include the shared `tx_hash` and `ledger` from the batch transaction, along with the item-specific `raffle_id`, `request_id`, `seed`, `proof`, and `method`.
3. WHEN a RevealItem fails within a batch, THE Worker SHALL NOT write an audit log entry for that item.

---

### Requirement 7: Soroban Contract — receive_randomness_batch Entry Point

**User Story:** As a smart contract maintainer, I want a batch entry point on the contract, so that the oracle can submit multiple reveals atomically.

#### Acceptance Criteria

1. THE Soroban_Contract SHALL expose a `receive_randomness_batch` function that accepts a `Vec` of `(raffle_id: u32, seed: BytesN<32>, proof: BytesN<64>)` entries.
2. WHEN `receive_randomness_batch` is invoked, THE Soroban_Contract SHALL process each entry in order, applying the same validation logic as the existing `receive_randomness` function.
3. WHEN an individual entry within `receive_randomness_batch` fails validation, THE Soroban_Contract SHALL record an error result for that entry and SHALL continue processing the remaining entries.
4. THE Soroban_Contract SHALL return a `Vec<Result<(), Error>>` from `receive_randomness_batch`, with one element per input entry, preserving input order.
5. WHEN all entries in `receive_randomness_batch` fail, THE Soroban_Contract SHALL still return `Ok` at the transaction level with a fully-populated error result vector, so the transaction is not rolled back.

---

### Requirement 8: Observability and Health Metrics

**User Story:** As an oracle operator, I want batch-specific metrics and logs, so that I can monitor batching efficiency and detect problems.

#### Acceptance Criteria

1. WHEN a batch is flushed, THE BatchCollector SHALL emit a log entry at `DEBUG` level containing the batch size and the trigger reason (`SIZE_LIMIT` or `TIMER`).
2. WHEN a batch transaction is confirmed, THE Worker SHALL log the batch size, transaction hash, ledger number, and count of successful versus failed items at `LOG` level.
3. THE HealthService SHALL track the count of batch submissions, total reveals batched, and total batch failures as named counters accessible via the existing health endpoint.
4. WHEN a batch contains only one RevealItem, THE TxSubmitterService SHALL fall back to calling the existing `receive_randomness` single-item entry point instead of `receive_randomness_batch`.
