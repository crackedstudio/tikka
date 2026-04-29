# Implementation Plan: Oracle Priority Queue

## Overview

Introduce tiered job prioritization to the existing Bull `randomness-queue` by adding a `PriorityClassifierService`, wiring it into the event listener's enqueue call, extending `HealthService` with per-tier counters, and surfacing those counters through the `/oracle/status` endpoint. No new queues or workers are created — only the enqueue call site, health tracking, and a new injectable service are touched.

## Tasks

- [x] 1. Create `PriorityClassifierService` with tier classification logic
  - Create `oracle/src/queue/priority-classifier.service.ts`
  - Define and export `PriorityTier`, `PriorityClassification`, and `BULL_PRIORITY` constants
  - Implement `classify(prizeAmount?: number): PriorityClassification` using `ConfigService` to read `ORACLE_HIGH_VALUE_THRESHOLD_XLM` (default 10000) and `ORACLE_MED_VALUE_THRESHOLD_XLM` (default 1000)
  - Log a `WARN` at construction time and fall back to defaults when `MED_THRESHOLD >= HIGH_THRESHOLD`
  - Treat `undefined`, `NaN`, and negative values as LOW tier (priority 10)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 1.1 Write property test: output domain invariant (Property 1)
    - **Property 1: Output domain invariant** — for any non-negative `prize_amount` (including `undefined`), `classify()` returns `priority` ∈ {1, 5, 10} and `tier` ∈ {'HIGH', 'MEDIUM', 'LOW'}
    - Use `fc.oneof(fc.float({ min: 0 }), fc.constant(undefined))`, minimum 100 runs
    - **Validates: Requirements 1.5, 5.5**

  - [ ]* 1.2 Write property test: HIGH tier classification (Property 2)
    - **Property 2: HIGH tier classification** — for any `prize_amount >= HIGH_THRESHOLD`, `classify()` returns `{ tier: 'HIGH', priority: 1 }`
    - Use `fc.float({ min: HIGH_THRESHOLD })`, minimum 100 runs
    - **Validates: Requirements 1.1, 5.1**

  - [ ]* 1.3 Write property test: MEDIUM tier classification (Property 3)
    - **Property 3: MEDIUM tier classification** — for any `prize_amount` in `[MED_THRESHOLD, HIGH_THRESHOLD)`, `classify()` returns `{ tier: 'MEDIUM', priority: 5 }`
    - Use `fc.float({ min: MED_THRESHOLD, max: HIGH_THRESHOLD - 0.001 })`, minimum 100 runs
    - **Validates: Requirements 1.2, 5.2**

  - [ ]* 1.4 Write property test: LOW tier classification (Property 4)
    - **Property 4: LOW tier classification** — for any `prize_amount` in `[0, MED_THRESHOLD)`, `classify()` returns `{ tier: 'LOW', priority: 10 }`
    - Use `fc.float({ min: 0, max: MED_THRESHOLD - 0.001 })`, minimum 100 runs
    - **Validates: Requirements 1.3, 5.3**

  - [ ]* 1.5 Write example-based unit tests for `PriorityClassifierService`
    - Boundary: `prizeAmount === HIGH_THRESHOLD` → HIGH / priority 1
    - Boundary: `prizeAmount === MED_THRESHOLD` → MEDIUM / priority 5
    - Boundary: `prizeAmount === MED_THRESHOLD - 1` → LOW / priority 10
    - Edge: `prizeAmount === undefined` → LOW / priority 10
    - Config defaults: no env vars set → thresholds are 10000 / 1000
    - Invalid config: `MED_THRESHOLD >= HIGH_THRESHOLD` → warning logged, defaults used
    - _Requirements: 3.3, 3.4, 3.5, 5.1, 5.2, 5.3, 5.4_

- [x] 2. Register `PriorityClassifierService` in `ListenerModule` and `QueueModule`
  - Add `PriorityClassifierService` to the `providers` array in `oracle/src/listener/listener.module.ts`
  - Export `PriorityClassifierService` from `ListenerModule` so it is available in tests
  - Add `PriorityClassifierService` to the `providers` array in `oracle/src/queue/queue.module.ts`
  - Import `ConfigModule` in `QueueModule` if not already present (needed by the classifier)
  - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.2_

- [x] 3. Extend `HealthService` with per-tier queue depth tracking
  - Add `private tierCounts: Record<PriorityTier, number>` state field initialised to `{ HIGH: 0, MEDIUM: 0, LOW: 0 }` in `oracle/src/health/health.service.ts`
  - Implement `incrementTierCount(tier: PriorityTier): void`
  - Implement `decrementTierCount(tier: PriorityTier): void` — clamp to 0, never go negative
  - Implement `getQueueDepthByTier(): { high: number; medium: number; low: number }`
  - Extend `HealthMetrics` interface with `queueDepthByTier: { high: number; medium: number; low: number }`
  - Include `queueDepthByTier` in the object returned by `getMetrics()`
  - _Requirements: 4.1, 4.3, 4.4_

  - [ ]* 3.1 Write property test: tier counter non-negativity invariant (Property 6)
    - **Property 6: Tier counter non-negativity invariant** — for any sequence of `incrementTierCount` / `decrementTierCount` calls where decrements never exceed prior increments, `getQueueDepthByTier()` returns non-negative counts for all tiers
    - Use `fc.array(fc.record({ op: fc.constantFrom('inc', 'dec'), tier: fc.constantFrom('HIGH', 'MEDIUM', 'LOW') }))` with a model that filters invalid sequences, minimum 100 runs
    - **Validates: Requirements 4.1, 4.4**

  - [ ]* 3.2 Write unit tests for `HealthService` tier methods
    - Verify `incrementTierCount` increases the correct tier count
    - Verify `decrementTierCount` decreases the correct tier count and clamps at 0
    - Verify `getQueueDepthByTier` returns 0 for all tiers on a fresh instance
    - Verify `getMetrics()` includes `queueDepthByTier`
    - _Requirements: 4.1, 4.3, 4.4_

- [x] 4. Wire `PriorityClassifierService` into `EventListenerService` enqueue call
  - Inject `PriorityClassifierService` into `EventListenerService` constructor in `oracle/src/listener/event-listener.service.ts`
  - Extend `parseEventData` / `handleRandomnessRequested` to extract `prize_amount` from the contract event map
  - Replace the bare `this.randomnessQueue.add({ raffleId, requestId })` call with:
    - Call `this.priorityClassifier.classify(prizeAmount)` to get `{ priority, tier }`
    - Pass `{ priority }` as the second argument to `queue.add()`
    - Call `this.healthService.incrementTierCount(tier)` inside the `.then()` callback (after successful enqueue)
  - _Requirements: 2.1, 2.3, 4.4_

  - [ ]* 4.1 Write property test: enqueue priority matches classification (Property 5)
    - **Property 5: Enqueue priority matches classification** — for any `prize_amount`, the `priority` option passed to `queue.add()` equals `classify(prizeAmount).priority`
    - Spy on `queue.add`, use `fc.option(fc.float({ min: 0 }))` for prize_amount, minimum 100 runs
    - **Validates: Requirements 2.1**

  - [ ]* 4.2 Write unit tests for `EventListenerService` enqueue path
    - Verify `queue.add` is called with the correct `priority` option for HIGH, MEDIUM, and LOW prize amounts
    - Verify `healthService.incrementTierCount` is called with the correct tier after a successful enqueue
    - Verify `healthService.incrementTierCount` is NOT called when `queue.add` rejects
    - _Requirements: 2.1, 2.3, 4.4_

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Call `decrementTierCount` in `RandomnessWorker` when a job is picked up
  - Inject `HealthService` into `RandomnessWorker` (it is already injected — verify the import)
  - At the start of `handleRandomnessJob` (the `@Process()` handler), determine the tier from `job.data.prizeAmount` using `PriorityClassifierService` and call `this.healthService.decrementTierCount(tier)`
  - Inject `PriorityClassifierService` into `RandomnessWorker` for this purpose
  - _Requirements: 4.4_

- [x] 7. Expose `queueDepthByTier` in `HealthController` `/oracle/status` response
  - In `oracle/src/health/health.controller.ts`, add `queueDepthByTier: this.healthService.getQueueDepthByTier()` to the object returned by `getStatus()`
  - Ensure the field is present at the top level of the response alongside the existing `metrics` block
  - _Requirements: 4.2, 4.3_

  - [ ]* 7.1 Write unit tests for `HealthController` status response shape
    - Verify `GET /oracle/status` response contains `queueDepthByTier` with `high`, `medium`, and `low` fields all ≥ 0
    - _Requirements: 4.2, 4.3_

- [x] 8. Add environment variables to `oracle/.env.example`
  - Append `ORACLE_HIGH_VALUE_THRESHOLD_XLM=10000` and `ORACLE_MED_VALUE_THRESHOLD_XLM=1000` with inline comments explaining their purpose
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check`, which is already in the oracle devDependencies
- Tier counters in `HealthService` are approximate (in-memory, incremented on enqueue, decremented on dequeue pickup) — consistent with how `queueDepth` is already tracked
- No new queues, workers, or Redis configuration changes are required
