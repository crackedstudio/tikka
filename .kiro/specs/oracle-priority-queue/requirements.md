# Requirements Document

## Introduction

The Oracle Priority Queue feature introduces tiered job prioritization for the BullMQ randomness queue. Currently all draw requests are enqueued with equal priority, meaning a low-value raffle can block a high-value one and increase the risk of on-chain timeout. This feature assigns a numeric BullMQ priority to each job based on the raffle's `prize_amount`, defines three configurable tiers (HIGH / MEDIUM / LOW), and exposes per-tier queue depth in the oracle health endpoint.

## Glossary

- **Priority_Classifier**: The component responsible for mapping a `prize_amount` value to a BullMQ priority number and tier label.
- **Randomness_Queue**: The BullMQ queue (`randomness-queue`) that holds draw-request jobs awaiting processing by the oracle.
- **RandomnessWorker**: The NestJS `@Processor` that consumes jobs from the Randomness_Queue.
- **Health_Service**: The `HealthService` class that tracks and exposes oracle operational metrics.
- **Health_Controller**: The NestJS controller that serves the `/oracle/status` endpoint.
- **Tier**: A named priority band — HIGH, MEDIUM, or LOW — each mapped to a distinct BullMQ numeric priority value.
- **HIGH_THRESHOLD**: The minimum `prize_amount` (in XLM) for a job to be classified as HIGH tier; configurable via `ORACLE_HIGH_VALUE_THRESHOLD_XLM`.
- **MED_THRESHOLD**: The minimum `prize_amount` (in XLM) for a job to be classified as MEDIUM tier; configurable via `ORACLE_MED_VALUE_THRESHOLD_XLM`.
- **BullMQ_Priority**: A positive integer assigned to a job; lower numbers are dequeued first by BullMQ.
- **Queue_Depth_Per_Tier**: The count of waiting jobs in the Randomness_Queue that belong to each Tier.

## Requirements

### Requirement 1: Priority Classification

**User Story:** As an oracle operator, I want each draw-request job to be assigned a priority based on prize amount, so that high-value raffles are processed before low-value ones under load.

#### Acceptance Criteria

1. THE Priority_Classifier SHALL map a `prize_amount` greater than or equal to HIGH_THRESHOLD to BullMQ_Priority 1 (HIGH tier).
2. THE Priority_Classifier SHALL map a `prize_amount` greater than or equal to MED_THRESHOLD and less than HIGH_THRESHOLD to BullMQ_Priority 5 (MEDIUM tier).
3. THE Priority_Classifier SHALL map a `prize_amount` less than MED_THRESHOLD to BullMQ_Priority 10 (LOW tier).
4. WHEN a `prize_amount` is absent or undefined, THE Priority_Classifier SHALL assign BullMQ_Priority 10 (LOW tier) as the default.
5. FOR ALL valid `prize_amount` values, the Priority_Classifier SHALL return exactly one Tier and one BullMQ_Priority number.

### Requirement 2: Job Enqueue with Priority

**User Story:** As an oracle operator, I want each job added to the Randomness_Queue to carry its computed BullMQ priority, so that BullMQ dequeues high-priority jobs first.

#### Acceptance Criteria

1. WHEN a draw-request event is received, THE Randomness_Queue SHALL enqueue the job with the BullMQ_Priority returned by the Priority_Classifier for that job's `prize_amount`.
2. WHEN two jobs are waiting and the first has a higher BullMQ_Priority number than the second, THE Randomness_Queue SHALL dequeue the second job (lower number = higher priority) before the first.
3. IF a job is enqueued without a `prize_amount`, THEN THE Randomness_Queue SHALL assign BullMQ_Priority 10 to that job.

### Requirement 3: Configurable Tier Thresholds

**User Story:** As an oracle operator, I want the tier thresholds to be configurable via environment variables, so that I can tune priority boundaries without redeploying code.

#### Acceptance Criteria

1. THE Priority_Classifier SHALL read HIGH_THRESHOLD from the environment variable `ORACLE_HIGH_VALUE_THRESHOLD_XLM`.
2. THE Priority_Classifier SHALL read MED_THRESHOLD from the environment variable `ORACLE_MED_VALUE_THRESHOLD_XLM`.
3. WHEN `ORACLE_HIGH_VALUE_THRESHOLD_XLM` is not set, THE Priority_Classifier SHALL use 10000 as the default HIGH_THRESHOLD.
4. WHEN `ORACLE_MED_VALUE_THRESHOLD_XLM` is not set, THE Priority_Classifier SHALL use 1000 as the default MED_THRESHOLD.
5. IF `ORACLE_MED_VALUE_THRESHOLD_XLM` is set to a value greater than or equal to `ORACLE_HIGH_VALUE_THRESHOLD_XLM`, THEN THE Priority_Classifier SHALL log a configuration warning and fall back to the default thresholds (10000 / 1000).

### Requirement 4: Per-Tier Queue Depth in Health Endpoint

**User Story:** As an oracle operator, I want the `/oracle/status` health endpoint to report queue depth broken down by tier, so that I can monitor backlog distribution without querying Redis directly.

#### Acceptance Criteria

1. THE Health_Service SHALL maintain a count of waiting jobs per Tier (HIGH, MEDIUM, LOW).
2. WHEN the `/oracle/status` endpoint is called, THE Health_Controller SHALL include a `queueDepthByTier` object in the response with fields `high`, `medium`, and `low` representing the current waiting job counts for each Tier.
3. WHEN no jobs are waiting in a Tier, THE Health_Controller SHALL report 0 for that Tier's count.
4. THE Health_Service SHALL update the per-tier counts each time a job is enqueued or dequeued from the Randomness_Queue.

### Requirement 5: Priority Assignment Unit Tests

**User Story:** As a developer, I want unit tests that verify the priority assignment logic, so that regressions in tier classification are caught automatically.

#### Acceptance Criteria

1. THE Priority_Classifier SHALL be covered by unit tests that verify a `prize_amount` at exactly HIGH_THRESHOLD is classified as HIGH tier with BullMQ_Priority 1.
2. THE Priority_Classifier SHALL be covered by unit tests that verify a `prize_amount` at exactly MED_THRESHOLD is classified as MEDIUM tier with BullMQ_Priority 5.
3. THE Priority_Classifier SHALL be covered by unit tests that verify a `prize_amount` below MED_THRESHOLD is classified as LOW tier with BullMQ_Priority 10.
4. THE Priority_Classifier SHALL be covered by unit tests that verify an undefined `prize_amount` is classified as LOW tier with BullMQ_Priority 10.
5. FOR ALL non-negative `prize_amount` values, the Priority_Classifier SHALL return a BullMQ_Priority that is one of {1, 5, 10} (round-trip property: classify then inspect priority is always a valid tier value).
