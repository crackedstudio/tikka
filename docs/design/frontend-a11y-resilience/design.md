# Design Document — Frontend A11y & Resilience

## Overview

This feature delivers four targeted improvements to the Tikka raffle platform frontend:

1. **Global Focus Indicators** — add `focus-visible` ring classes to every interactive element across seven components/pages.
2. **Reusable `EmptyState` Component** — a single shared component replaces three hand-rolled empty-state blocks.
3. **API Client Retry Logic + Tests** — one-retry-on-failure for GET requests with exponential backoff and a comprehensive property-based test suite.
4. **Accessible Countdown Announcer** — milestone-driven `aria-live` announcements in `CountdownTimer.tsx` while silencing the visual ticking digits from the accessibility tree.

These changes are purely additive or in-place modifications; no new routes, providers, or build configuration are required.

---

## Architecture

The four improvements are independent of each other and touch different layers of the frontend:

```
┌─────────────────────────────────────────────────────────┐
│                     React Component Tree                │
│                                                         │
│  ┌──────────────────────────┐  ┌─────────────────────┐  │
│  │  UI Components           │  │  Pages              │  │
│  │  ─ WalletButton     [1] │  │  ─ Search       [1] │  │
│  │  ─ SignInButton     [1] │  │  ─ Leaderboard  [1] │  │
│  │  ─ Breadcrumbs      [1] │  │  ─ MyRaffles    [1] │  │
│  │  ─ EmptyState (new) [2] │  │                     │  │
│  │  ─ CountdownTimer   [4] │  │                     │  │
│  │  ─ LeaderboardSection[1]│  │                     │  │
│  └──────────────────────────┘  └─────────────────────┘  │
│                                                         │
│  ┌──────────────────────────┐                           │
│  │  Services / Hooks        │                           │
│  │  ─ apiClient.ts     [3] │                           │
│  │  ─ useCountdown.ts  [4] │                           │
│  └──────────────────────────┘                           │
└─────────────────────────────────────────────────────────┘
```

Legend: `[1]` = focus indicators, `[2]` = EmptyState, `[3]` = retry logic, `[4]` = countdown announcer.

No new providers, routes, or third-party dependencies are introduced. The existing `fast-check` + Vitest testing stack is used as-is.

---

## Components and Interfaces

### 1. Focus Indicators (Req 1)

No new component is created. The following constant string is applied uniformly to every interactive element:

```
FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF389C] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#11172E]"
```

Affected files and elements:

| File                     | Elements receiving Focus_Ring                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WalletButton.tsx`       | All `<button>` elements (connect, disconnect, connecting disabled, error state)                                                                                     |
| `SignInButton.tsx`       | All `<button>` elements (sign-in, signed-in/logout, authenticating disabled)                                                                                        |
| `Breadcrumbs.tsx`        | `<Link>` elements (rendered as `<a>`)                                                                                                                               |
| `Leaderboard.tsx`        | Sort `<button>` elements; address `<a>` elements in table rows                                                                                                      |
| `Search.tsx`             | "Go Back" `<button>` (will be replaced by `EmptyState`'s CTA)                                                                                                       |
| `MyRaffles.tsx`          | Tab `<button>`, pagination `<button>`, "Connect Wallet" `<button>`, "View My Created Raffles" `<Link>`, "Browse Raffles" `<Link>` (latter replaced by `EmptyState`) |
| `LeaderboardSection.tsx` | Tab `<button>` elements                                                                                                                                             |

### 2. `EmptyState` Component (Req 2)

**File:** `client/src/components/ui/EmptyState.tsx`

```typescript
interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: EmptyStateAction;
}
```

Rendering rules:

- `icon` — rendered in a centred icon container (consistent with existing empty-state styling).
- `title` — rendered as `<h3>` with `font-semibold`.
- `hint` — when present, rendered as a `<p>` in muted colour below the title.
- `action`:
  - When `action.href` is present → `<a href={action.href}>` (href takes precedence even if `onClick` also supplied).
  - When only `action.onClick` is present → `<button onClick={action.onClick}>`.
  - Both the `<a>` and `<button>` carry the `FOCUS_RING` classes plus the existing pink CTA styling.
  - When `action` is omitted → no CTA element is rendered.

Adoption:

- `Search.tsx` — replaces the inline empty-state block; passes the animated search SVG icon, title "No raffles found", the contextual hint interpolating the query, and `action={{ label: "Go Back", onClick: () => navigate("/home") }}`.
- `Leaderboard.tsx` — replaces inline empty-state; passes the list SVG icon, title "No Leaderboard Data Yet", hint text, no action.
- `MyRaffles.tsx` — replaces both tab empty-states (participated + won); passes appropriate per-tab icon, title, hint, and `action={{ label: "Browse Raffles", href: "/home" }}`.

### 3. API Client Retry Logic (Req 3)

**File:** `client/src/services/apiClient.ts` — modifications to `apiRequest`.

**Retry helper (pure function, exportable for testing):**

```typescript
export function retryDelay(attempt: number): number {
  return Math.min(500 * Math.pow(2, attempt), 10_000);
}
```

**Retry predicate:**

```typescript
function shouldRetry(method: string, error: unknown, response?: Response): boolean {
  if (method.toUpperCase() !== 'GET') return false;
  if (response) return response.status >= 500 && response.status <= 599;
  return true; // network / abort error with no response
}
```

**Modified `apiRequest` flow (GET only, max 1 retry):**

```
attempt 0:
  try fetch(url, options)
  on network error OR 5xx → wait retryDelay(0) = 500 ms → attempt 1
  on 4xx (exc. 401 which clears token) → throw immediately, no toast silent
  on 2xx → return parsed body

attempt 1 (retry):
  try fetch(url, options)
  on network error OR 5xx → show toast once → throw
  on 2xx → return parsed body (no toast)
```

Toast behaviour:

- Current code shows a toast on every failure. After the change, the toast is **suppressed on the first failure** when a retry will follow. It fires **once** only on final failure (after retry exhaustion).
- Non-GET failures (POST/PUT/DELETE): toast behaviour unchanged — fires immediately on failure.

**Test file:** `client/src/services/apiClient.spec.ts`

### 4. Countdown Announcer (Req 4)

**File:** `client/src/components/ui/CountdownTimer.tsx`

Changes:

- Wrap the existing visual `<div>` with `aria-hidden="true"`.
- Add a sibling `<div className="sr-only" aria-live="polite" aria-atomic="true">` whose text content is managed by state.
- Add a `useRef<Set<string>>` (named `announcedRef`) to track which milestones have been announced per instance.
- In a `useEffect` that runs whenever `{ days, hours, minutes, seconds, expired }` changes, compute total remaining seconds and check milestones:
  - `expired` → "Raffle ended" (key: `"ended"`)
  - `totalSeconds <= 3600` → "1 hour remaining" (key: `"1h"`)
  - `totalSeconds <= 600` → "10 minutes remaining" (key: `"10m"`)
  - `totalSeconds <= 60` → "1 minute remaining" (key: `"1m"`)
- Only announce a milestone if its key is not already in `announcedRef.current`. Add key on first announcement.
- Milestone resolution order: check `expired` first, then 1-minute, then 10-minute, then 1-hour (most specific to least), so only the most relevant threshold fires on any given tick.

---

## Data Models

### EmptyState Props

```typescript
// client/src/components/ui/EmptyState.tsx
import type { ReactNode } from 'react';

export interface EmptyStateAction {
  /** CTA button/link label */
  label: string;
  /** When provided, CTA renders as <a href={href}>. Takes precedence over onClick. */
  href?: string;
  /** When href is absent, CTA renders as <button onClick={onClick}>. */
  onClick?: () => void;
}

export interface EmptyStateProps {
  /** Icon or graphic displayed above the title. */
  icon: ReactNode;
  /** Heading text rendered as <h3>. */
  title: string;
  /** Optional secondary description. */
  hint?: string;
  /** Optional single call-to-action. */
  action?: EmptyStateAction;
}
```

### Retry Delay Formula

```
retryDelay(attempt: number): number
  = min(500 × 2^attempt, 10_000)

attempt 0 → 500 ms   (first retry)
attempt 1 → 1_000 ms (would be second retry, but max retries = 1 so never used in practice)
```

The formula is exported as a pure function so it can be directly property-tested.

### Milestone Keys

```typescript
type MilestoneKey = '1h' | '10m' | '1m' | 'ended';
```

Thresholds (total remaining seconds):

- `'ended'` → `expired === true`
- `'1m'` → `totalSeconds <= 60`
- `'10m'` → `totalSeconds <= 600`
- `'1h'` → `totalSeconds <= 3600`

---

## Correctness Properties

_A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees._

### Property Reflection

Before listing the final properties, the following redundancies were resolved:

- Req 3.1 (network error retry) and 3.7 (retry success returns body) are the same scenario — combined into Property 3.
- Req 3.2 (5xx retry) and 3.7 also overlap — combined into Property 4.
- Req 4.1 (aria-hidden) and 4.2 (aria-live region present) are both structural "always-holds" checks about the rendered DOM — combined into one structural property (Property 7) to avoid over-testing the same render call.
- Req 4.3–4.6 (individual milestones) share the same "threshold triggers announcement" shape — kept separate because each has a distinct threshold value and distinct announcement text. Merging would obscure which threshold is failing.
- Req 4.7 (announce once) subsumes Req 4.9 (past endTime) since "already expired" is just another instantiation of the "announce once per instance" invariant — Property 11 covers the general case, edge case 4.9 is covered by the generator producing past timestamps.
- Req 4.10 (empty live region before first threshold) is distinct from 4.7 and is kept as Property 12.

---

### Property 1: EmptyState always renders title inside h3

_For any_ non-empty title string, rendering `EmptyState` with that title SHALL produce an `<h3>` element whose text content includes that exact string.

**Validates: Requirements 2.2, 2.5**

---

### Property 2: EmptyState always renders hint when provided

_For any_ non-empty hint string, rendering `EmptyState` with that hint SHALL produce a visible text node whose content includes that hint string.

**Validates: Requirements 2.3**

---

### Property 3: GET retry on network error returns success body

_For any_ API endpoint path, when `fetch` rejects on the first call and resolves with a 2xx response on the second call, `apiRequest` with method GET SHALL call fetch exactly twice and return the parsed response body from the second call.

**Validates: Requirements 3.1, 3.7**

---

### Property 4: GET retry on 5xx returns success body

_For any_ API endpoint path and any HTTP status code in the range 500–599, when `fetch` returns that status code on the first call and a 200 response on the second call, `apiRequest` with method GET SHALL call fetch exactly twice and return the parsed response body from the second call.

**Validates: Requirements 3.2, 3.7**

---

### Property 5: GET exhausts retry on double failure

_For any_ API endpoint path, when `fetch` consistently returns a network error or a 5xx response on every call, `apiRequest` with method GET SHALL call fetch exactly 2 times in total and then propagate the error.

**Validates: Requirements 3.3**

---

### Property 6: Non-GET methods never retry

_For any_ API endpoint path and any HTTP method in `{POST, PUT, DELETE}`, when `fetch` returns a network error or a 5xx response, `apiRequest` SHALL call fetch exactly 1 time and then propagate the error.

**Validates: Requirements 3.5**

---

### Property 7: CountdownTimer always renders structural accessibility elements

_For any_ valid `endTime` value (past or future), `CountdownTimer` SHALL render both (a) a container with `aria-hidden="true"` wrapping the visual digits and (b) a sibling element with `aria-live="polite"`, `aria-atomic="true"`, and the `sr-only` class.

**Validates: Requirements 4.1, 4.2, 4.8**

---

### Property 8: 1-hour milestone announcement

_For any_ `endTime` that causes total remaining seconds to drop to or below 3600 for the first time during a render cycle, the CountdownTimer `aria-live` region SHALL contain "1 hour remaining".

**Validates: Requirements 4.3**

---

### Property 9: 10-minute milestone announcement

_For any_ `endTime` that causes total remaining seconds to drop to or below 600 for the first time, the CountdownTimer `aria-live` region SHALL contain "10 minutes remaining".

**Validates: Requirements 4.4**

---

### Property 10: 1-minute milestone announcement

_For any_ `endTime` that causes total remaining seconds to drop to or below 60 for the first time, the CountdownTimer `aria-live` region SHALL contain "1 minute remaining".

**Validates: Requirements 4.5**

---

### Property 11: Expiry milestone announced exactly once

_For any_ `endTime` in the past (or one that crosses expiry during the test), the CountdownTimer `aria-live` region SHALL contain "Raffle ended" and, after the first announcement, SHALL NOT change back to a different milestone key or re-announce "Raffle ended" on subsequent ticks.

**Validates: Requirements 4.6, 4.7, 4.9**

---

### Property 12: Live region is empty before first threshold

_For any_ `endTime` more than 3600 seconds in the future at initial render time, the CountdownTimer `aria-live` region SHALL be empty on the first render before any timers advance.

**Validates: Requirements 4.10**

---

### Property 13: Retry delay formula is correct and capped

_For any_ non-negative integer attempt index, `retryDelay(attempt)` SHALL equal `Math.min(500 * 2^attempt, 10_000)` and SHALL never exceed 10 000.

**Validates: Requirements 3.8**

---

### Property 14: No toast on successful retry

_For any_ API endpoint path, when a GET request fails on the first call and succeeds on the retry, `toast.error` SHALL NOT be called.

**Validates: Requirements 3.11**

---

### Property 15: Toast fires exactly once on final failure

_For any_ API endpoint path, when a GET request fails on both the first call and the retry, `toast.error` SHALL be called exactly once.

**Validates: Requirements 3.11**

---

## Error Handling

### API Client

| Scenario                         | Behaviour                                           |
| -------------------------------- | --------------------------------------------------- |
| Network error on 1st GET attempt | Suppress toast, wait `retryDelay(0)`, retry         |
| 5xx on 1st GET attempt           | Suppress toast, wait `retryDelay(0)`, retry         |
| Network error on retry           | Show toast once, throw error                        |
| 5xx on retry                     | Show toast once, throw error                        |
| 4xx on GET (non-401)             | Show toast once immediately, throw error            |
| 401 on any method                | Clear token, show "Unauthorized" toast, throw error |
| Network error on POST/PUT/DELETE | Show toast immediately, throw error                 |
| Timeout (AbortSignal)            | Treated as network error, same retry logic for GET  |

The `retryDelay` sleep is implemented with a plain `Promise`-based `setTimeout` wrapper:

```typescript
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

Tests use `vi.useFakeTimers()` / `vi.runAllTimersAsync()` to advance time without real waits.

### EmptyState

`EmptyState` has no async operations. No error states are needed. If `action.href` and `action.onClick` are both supplied, the component silently falls back to rendering an `<a>` element (href wins); no console warning is emitted.

### CountdownTimer

`useCountdown` already handles the case where `endTime` is in the past by returning `expired: true` immediately. The announcer effect reads `expired` directly, so no additional error handling is needed. Parsing of `endTime` (string ISO date or Unix timestamp number) is handled by `useCountdown`.

---

## Testing Strategy

### Dual Testing Approach

Both example-based unit tests and property-based tests (via fast-check) are used:

- **Unit / example tests** — specific scenarios, structural checks, edge cases.
- **Property tests** — universal correctness properties across many generated inputs (minimum 100 iterations each).

### Test Files and Responsibilities

| Test file                                          | What it covers                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `client/src/services/apiClient.spec.ts`            | All Req 3 properties (retry logic, delay formula, toast suppression)    |
| `client/src/components/ui/EmptyState.spec.tsx`     | All Req 2 properties + example-based structural tests                   |
| `client/src/components/ui/CountdownTimer.spec.tsx` | All Req 4 properties (accessibility structure, milestone announcements) |

Focus-indicator correctness (Req 1) is verified by code review during implementation. Automated DOM class checks for Req 1 are deliberately omitted — class string checks against Tailwind utilities are brittle and would need to be updated whenever the design token changes. The implementation diff is the authoritative source of truth for Req 1.

### Property-Based Testing Library

`fast-check` is already installed and in use (`authService.spec.ts`). All property tests use:

```typescript
import * as fc from 'fast-check';
// ...
await fc.assert(fc.asyncProperty(...), { numRuns: 100 });
```

Each property test is tagged with a comment:

```
// Feature: frontend-a11y-resilience, Property N: <property_text>
```

### apiClient.spec.ts Test Structure

```typescript
// Uses vi.useFakeTimers() to fast-forward through retryDelay sleep
// Uses vi.stubGlobal('fetch', ...) matching authService.spec.ts pattern
// Uses vi.spyOn(sonner, 'toast') to assert toast call counts

describe('P13: retryDelay formula', () => {
  /* fc.property */
});
describe('P3:  GET retries once on network error', () => {
  /* fc.asyncProperty */
});
describe('P4:  GET retries once on 5xx', () => {
  /* fc.asyncProperty */
});
describe('P5:  GET exhausts retry on double failure', () => {
  /* fc.asyncProperty */
});
describe('P6:  Non-GET methods do not retry', () => {
  /* fc.asyncProperty */
});
describe('P14: No toast on successful retry', () => {
  /* fc.asyncProperty */
});
describe('P15: Toast fires once on final failure', () => {
  /* fc.asyncProperty */
});
// Example-based:
describe('GET succeeds on first attempt — no retry', () => {
  /* example */
});
describe('4xx response — no retry, immediate error', () => {
  /* example */
});
describe('timeout abort treated as network error', () => {
  /* example */
});
```

### EmptyState.spec.tsx Test Structure

```typescript
// Uses @testing-library/react + @testing-library/jest-dom
describe('P1: title always inside h3', () => {
  /* fc.property */
});
describe('P2: hint always rendered when provided', () => {
  /* fc.property */
});
describe('action rendering — href → <a>, onClick → <button>', () => {
  /* examples */
});
describe('href takes precedence over onClick', () => {
  /* example */
});
describe('no action → no CTA element', () => {
  /* example */
});
describe('CTA carries Focus_Ring classes', () => {
  /* example */
});
```

### CountdownTimer.spec.tsx Test Structure

```typescript
// Uses @testing-library/react + vi.useFakeTimers()
describe('P7:  structural a11y elements present', () => {
  /* fc.property, random future endTimes */
});
describe('P8:  1-hour milestone', () => {
  /* example advancing past 3600s */
});
describe('P9:  10-minute milestone', () => {
  /* example advancing past 600s */
});
describe('P10: 1-minute milestone', () => {
  /* example advancing past 60s */
});
describe('P11: expiry announced exactly once', () => {
  /* example + past endTime */
});
describe('P12: live region empty before first threshold', () => {
  /* fc.property, future endTimes > 3600s */
});
```

### Test Configuration

All property tests run with `numRuns: 100`. The `vitest.config.ts` already targets `src/**/*.spec.ts` and `src/**/*.spec.tsx` with jsdom environment, so no configuration changes are required.
