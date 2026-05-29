# Design Document: Oracle Priority Queue

## Overview

The Oracle Priority Queue feature adds tiered job prioritization to the existing Bull `randomness-queue`. Currently all draw-request jobs are enqueued with equal priority, so a burst of low-value raffles can delay high-value ones and risk on-chain timeouts. This design introduces a `PriorityClassifierService` that maps each job's `prize_amount` to one of three tiers (HIGH / MEDIUM / LOW) and a corresponding Bull numeric priority. The event listener passes that priority when calling `queue.add()`, and the `HealthService` tracks per-tier waiting counts that are surfaced through the existing `/oracle/status` endpoint.

The change is intentionally narrow: no new queues, no new workers, no changes to the randomness computation path. Only the enqueue call site, the health tracking, and a new injectable service are touched.

## Architecture

```mermaid
flowchart TD
    A[Stellar Event\nRandomnessRequested] --> B[EventListenerService\nhandleRandomnessRequested]
    B --> C[PriorityClassifierService\nclassify(prizeAmount)]
    C --> D{Tier}
    D -->|HIGH ≥ HIGH_THRESHOLD| E[priority: 1]
    D -->|MED ≥ MED_THRESHOLD| F[priority: 5]
    D -->|LOW < MED_THRESHOLD| G[priority: 10]
    E & F & G --> H[randomness-queue.add\n{ priority }]
    H --> I[HealthService\nupdateQueueDepthByTier]
    H --> J[RandomnessWorker\nprocesses in priority order]
```

**Key design decisions:**

- **Single classifier service** — `PriorityClassifierService` is a pure, injectable NestJS service with no side effects. This makes it trivially testable and reusable.
- **Bull numeric priority** — Bull uses lower numbers = higher priority. The three fixed values (1, 5, 10) leave room for future tiers without renumbering existing ones.
- **No queue changes** — the existing `randomness-queue` already supports Bull's `priority` job option. No new queue registration is needed.
- **In-memory tier counters** — per-tier counts are maintained in `HealthService` (already the single source of truth for operational metrics). Counts are approximate: they are incremented on enqueue and decremented when the worker picks up a job. This is consistent with how `queueDepth` is already tracked.

## Components and Interfaces

### PriorityClassifierService

New injectable service in `oracle/src/queue/priority-classifier.service.ts`.

```typescript
export type PriorityTier = 'HIGH' | 'MEDIUM' | 'LOW';

export interface PriorityClassification {
  tier: PriorityTier;
  priority: 1 | 5 | 10;  // Bull numeric priority; lower = processed first
}

export const BULL_PRIORITY = {
  HIGH: 1,
  MEDIUM: 5,
  LOW: 10,
} as const;
```

**Constructor** reads `ORACLE_HIGH_VALUE_THRESHOLD_XLM` (default 10000) and `ORACLE_MED_VALUE_THRESHOLD_XLM` (default 1000) from `ConfigService`. If `MED_THRESHOLD >= HIGH_THRESHOLD`, it logs a warning and falls back to the defaults.

**`classify(prizeAmount?: number): PriorityClassification`**

| Condition | Tier | Priority |
|---|---|---|
| `prizeAmount >= HIGH_THRESHOLD` | HIGH | 1 |
| `prizeAmount >= MED_THRESHOLD` | MEDIUM | 5 |
| `prizeAmount < MED_THRESHOLD` or `undefined` | LOW | 10 |

### EventListenerService (modified)

`handleRandomnessRequested` currently calls:

```typescript
this.randomnessQueue.add({ raffleId, requestId })
```

It will be updated to:

```typescript
const { priority, tier } = this.priorityClassifier.classify(prizeAmount);
this.randomnessQueue.add(
  { raffleId, requestId, prizeAmount },
  { priority }
).then(() => {
  this.currentQueueDepth++;
  this.healthService.updateQueueDepth(this.currentQueueDepth);
  this.healthService.incrementTierCount(tier);
});
```

`PriorityClassifierService` is injected via the constructor. `EventListenerService` already receives `prizeAmount` indirectly through the event payload — the `parseEventData` call will be extended to extract `prize_amount` from the contract event map.

### HealthService (modified)

Two additions to `HealthService`:

```typescript
// New state
private tierCounts: Record<PriorityTier, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };

// New methods
incrementTierCount(tier: PriorityTier): void
decrementTierCount(tier: PriorityTier): void
getQueueDepthByTier(): Record<'high' | 'medium' | 'low', number>
```

`decrementTierCount` is called from `RandomnessWorker.handleRandomnessJob` (the `@Process()` handler) when a job is picked up, so the count reflects waiting jobs rather than in-flight ones.

`HealthMetrics` interface gains:

```typescript
queueDepthByTier: { high: number; medium: number; low: number };
```

### HealthController (modified)

The `/oracle/status` response gains a `queueDepthByTier` field alongside the existing `metrics` block:

```typescript
queueDepthByTier: this.healthService.getQueueDepthByTier(),
```

### ListenerModule / QueueModule (modified)

`PriorityClassifierService` is added to the providers of `ListenerModule` (where `EventListenerService` lives) and exported so it can be used in tests. It also needs to be available in `QueueModule` if the worker needs to call `decrementTierCount` — the `HealthService` is already shared via `HealthModule`.

## Data Models

### PriorityClassification

```typescript
export type PriorityTier = 'HIGH' | 'MEDIUM' | 'LOW';

export interface PriorityClassification {
  tier: PriorityTier;
  priority: 1 | 5 | 10;
}
```

### HealthMetrics (extended)

```typescript
export interface HealthMetrics {
  // ... existing fields ...
  queueDepthByTier: {
    high: number;
    medium: number;
    low: number;
  };
}
```

### RandomnessJobPayload (unchanged)

`RandomnessRequest` already has `prizeAmount?: number`. No schema change is needed.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ORACLE_HIGH_VALUE_THRESHOLD_XLM` | `10000` | Minimum prize (XLM) for HIGH tier |
| `ORACLE_MED_VALUE_THRESHOLD_XLM` | `1000` | Minimum prize (XLM) for MEDIUM tier |

These are added to `oracle/.env.example`.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

The oracle project already has `fast-check` in its devDependencies, so property-based tests are written using that library.

### Property 1: Output domain invariant

*For any* non-negative `prize_amount` value (including `undefined`), `PriorityClassifierService.classify()` SHALL return a `priority` that is exactly one of `{1, 5, 10}` and a `tier` that is exactly one of `{'HIGH', 'MEDIUM', 'LOW'}`.

**Validates: Requirements 1.5, 5.5**

---

### Property 2: HIGH tier classification

*For any* `prize_amount` value greater than or equal to `HIGH_THRESHOLD`, `classify()` SHALL return `{ tier: 'HIGH', priority: 1 }`.

**Validates: Requirements 1.1, 5.1**

---

### Property 3: MEDIUM tier classification

*For any* `prize_amount` value in the range `[MED_THRESHOLD, HIGH_THRESHOLD)`, `classify()` SHALL return `{ tier: 'MEDIUM', priority: 5 }`.

**Validates: Requirements 1.2, 5.2**

---

### Property 4: LOW tier classification

*For any* `prize_amount` value in the range `[0, MED_THRESHOLD)`, `classify()` SHALL return `{ tier: 'LOW', priority: 10 }`.

**Validates: Requirements 1.3, 5.3**

---

### Property 5: Enqueue priority matches classification

*For any* `prize_amount` value, when `EventListenerService` handles a `RandomnessRequested` event, the `priority` option passed to `queue.add()` SHALL equal `classify(prizeAmount).priority`.

**Validates: Requirements 2.1**

---

### Property 6: Tier counter non-negativity invariant

*For any* sequence of `incrementTierCount` and `decrementTierCount` calls where decrements never exceed prior increments for a given tier, `getQueueDepthByTier()` SHALL return non-negative counts for all three tiers.

**Validates: Requirements 4.1, 4.4**

---

**Property Reflection:**

- Properties 2, 3, and 4 together cover the full input domain and are not redundant with each other — each tests a distinct range. Property 1 is not redundant with them: it tests the output domain constraint (valid values) independently of which specific value is returned, and it covers `undefined` input.
- Property 5 is distinct from Properties 1–4: it tests the integration between the classifier and the enqueue call site, not the classifier in isolation.
- Property 6 is distinct from all others: it tests the HealthService counter invariant, not the classifier.
- Requirements 2.3 (undefined prize_amount → priority 10) and 4.3 (zero counts) are edge cases covered by the generators in Properties 1 and 6 respectively, so no separate properties are needed.

## Error Handling

| Scenario | Handling |
|---|---|
| `ORACLE_MED_VALUE_THRESHOLD_XLM >= ORACLE_HIGH_VALUE_THRESHOLD_XLM` | Log `WARN` at startup, fall back to defaults (10000 / 1000). Service continues normally. |
| `prize_amount` is `undefined` or `NaN` | Treated as LOW tier (priority 10). No error thrown. |
| `prize_amount` is negative | Treated as LOW tier (priority 10). Negative prize amounts are not valid domain values but the classifier degrades gracefully. |
| `queue.add()` rejects | Existing error handling in `EventListenerService` catches and logs the rejection. Tier counter is not incremented if `add()` fails (increment is inside `.then()`). |
| `decrementTierCount` called when count is already 0 | Counter is clamped to 0 (no negative counts). |

## Testing Strategy

### Unit Tests (Jest + fast-check)

**`priority-classifier.service.spec.ts`** — covers all five correctness properties plus the example-based configuration tests:

- **Property 1** (output domain): `fc.oneof(fc.float({ min: 0 }), fc.constant(undefined))` → assert priority ∈ {1, 5, 10} and tier ∈ {'HIGH', 'MEDIUM', 'LOW'}. Minimum 100 iterations.
  - Tag: `Feature: oracle-priority-queue, Property 1: output domain invariant`
- **Property 2** (HIGH tier): `fc.float({ min: HIGH_THRESHOLD })` → assert `{ tier: 'HIGH', priority: 1 }`. Minimum 100 iterations.
  - Tag: `Feature: oracle-priority-queue, Property 2: HIGH tier classification`
- **Property 3** (MEDIUM tier): `fc.float({ min: MED_THRESHOLD, max: HIGH_THRESHOLD - 0.001 })` → assert `{ tier: 'MEDIUM', priority: 5 }`. Minimum 100 iterations.
  - Tag: `Feature: oracle-priority-queue, Property 3: MEDIUM tier classification`
- **Property 4** (LOW tier): `fc.float({ min: 0, max: MED_THRESHOLD - 0.001 })` → assert `{ tier: 'LOW', priority: 10 }`. Minimum 100 iterations.
  - Tag: `Feature: oracle-priority-queue, Property 4: LOW tier classification`
- **Example tests** (Req 3.1–3.5, 5.1–5.4): boundary values at exactly HIGH_THRESHOLD and MED_THRESHOLD, `undefined` input, default env var values, invalid config fallback.

**`health.service.spec.ts`** (extended) — covers Property 6:

- **Property 6** (tier counter non-negativity): `fc.array(fc.record({ op: fc.constantFrom('inc', 'dec'), tier: fc.constantFrom('HIGH', 'MEDIUM', 'LOW') }))` with a model that tracks expected counts, filtering sequences where decrements would go below zero → assert all counts ≥ 0. Minimum 100 iterations.
  - Tag: `Feature: oracle-priority-queue, Property 6: tier counter non-negativity invariant`

**`event-listener.service.spec.ts`** (extended) — covers Property 5:

- **Property 5** (enqueue priority): `fc.option(fc.float({ min: 0 }))` for prize_amount → spy on `queue.add`, assert the `priority` option matches `classify(prizeAmount).priority`. Minimum 100 iterations.
  - Tag: `Feature: oracle-priority-queue, Property 5: enqueue priority matches classification`

### Integration Tests

- **Dequeue ordering** (Req 2.2): A single integration test with a real Redis instance (or `ioredis-mock`) that enqueues a LOW-priority job followed by a HIGH-priority job and asserts the HIGH job is dequeued first. This tests Bull's priority queue semantics, not our code, so 1–2 examples suffice.

### Example-Based Unit Tests

- Boundary values: `prizeAmount === HIGH_THRESHOLD` → HIGH, `prizeAmount === MED_THRESHOLD` → MEDIUM, `prizeAmount === MED_THRESHOLD - 1` → LOW, `prizeAmount === undefined` → LOW.
- Config defaults: no env vars set → thresholds are 10000 / 1000.
- Invalid config: `MED_THRESHOLD >= HIGH_THRESHOLD` → warning logged, defaults used.
- Health endpoint shape: `GET /oracle/status` response contains `queueDepthByTier.high`, `.medium`, `.low` all ≥ 0.
