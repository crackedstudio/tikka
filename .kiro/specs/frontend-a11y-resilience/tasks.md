# Implementation Plan: Frontend A11y & Resilience

## Overview

Four independent improvements to the Tikka frontend, implemented in separate task groups:
1. Focus indicators applied uniformly across seven components/pages.
2. Shared `EmptyState` component replacing three hand-rolled blocks.
3. API client retry logic with a full property-based test suite.
4. Accessible countdown announcer with milestone-driven `aria-live` region.

All work is in `client/src/`. No new routes, providers, or build configuration.

---

## Tasks

- [~] 1. Apply focus-visible ring to WalletButton, SignInButton, and Breadcrumbs
  - Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF389C] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#11172E]` to every `<button>` element in `WalletButton.tsx` (connect, disconnect, connecting-disabled, and error-state variants)
  - Add the same Focus_Ring classes to every `<button>` element in `SignInButton.tsx` (sign-in, signed-in/logout, and authenticating-disabled variants)
  - Add the Focus_Ring classes to every `<Link>` element in `Breadcrumbs.tsx`
  - _Requirements: 1.1, 1.3, 1.4, 1.5_

- [ ] 2. Apply focus-visible ring to Leaderboard, LeaderboardSection, Search, and MyRaffles
  - [~] 2.1 Add Focus_Ring classes to the three sort `<button>` elements and the address `<a>` elements in table rows in `Leaderboard.tsx`
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

  - [~] 2.2 Add Focus_Ring classes to all tab `<button>` elements in `LeaderboardSection.tsx`
    - _Requirements: 1.2, 1.3, 1.5_

  - [~] 2.3 Add Focus_Ring classes to the "Go Back" `<button>` in `Search.tsx` (this element will be replaced by `EmptyState` in task 4, so apply the ring directly to the existing button now as an interim step)
    - _Requirements: 1.2, 1.3, 1.5_

  - [~] 2.4 Add Focus_Ring classes to the tab `<button>` elements, pagination `<button>` elements, "Connect Wallet" `<button>`, "View My Created Raffles" `<Link>`, and "Browse Raffles" `<Link>` in `MyRaffles.tsx`
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

- [x] 3. Create the `EmptyState` component
  - [x] 3.1 Create `client/src/components/ui/EmptyState.tsx`
    - Define and export `EmptyStateAction` and `EmptyStateProps` interfaces (`icon: ReactNode`, `title: string`, `hint?: string`, `action?: EmptyStateAction`)
    - Render `icon` in a centred container matching existing empty-state icon container styling
    - Render `title` as `<h3 className="... font-semibold">`
    - Render `hint` as a `<p>` in muted colour when provided
    - When `action.href` is present, render CTA as `<a href={action.href}>` with Focus_Ring + pink CTA classes; when only `action.onClick` is present, render as `<button onClick={action.onClick}>` with same classes; when `action` is absent, render no CTA element
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [ ]* 3.2 Write property tests for `EmptyState` in `client/src/components/ui/EmptyState.spec.tsx`
    - **Property 1: EmptyState always renders title inside h3**
    - **Validates: Requirements 2.2, 2.5**
    - **Property 2: EmptyState always renders hint when provided**
    - **Validates: Requirements 2.3**
    - Add example-based tests: `action.href` → `<a>`, `action.onClick` → `<button>`, href takes precedence over onClick, no action → no CTA, CTA carries Focus_Ring classes
    - _Requirements: 2.4, 2.6, 2.7, 2.8_

- [ ] 4. Replace inline empty states with `EmptyState` in Search, Leaderboard, and MyRaffles
  - [x] 4.1 In `Search.tsx`, replace the hand-rolled empty-state block with `<EmptyState>`, passing the animated search SVG icon (with its ping animation wrapper), title `"No raffles found"`, hint interpolating the query, and `action={{ label: "Go Back", onClick: () => navigate("/home") }}`; remove the now-redundant standalone `<button>` that was given a focus ring in task 2.3
    - _Requirements: 2.9_

  - [x] 4.2 In `Leaderboard.tsx`, replace the hand-rolled empty-state block with `<EmptyState>`, passing the list SVG icon, title `"No Leaderboard Data Yet"`, and the existing hint text (no action)
    - _Requirements: 2.10_

  - [x] 4.3 In `MyRaffles.tsx`, replace both hand-rolled empty-state blocks (participated and won tabs) with `<EmptyState>`
    - For the participated tab: pass the list/history SVG icon, title `"No history yet"`, hint `"You haven't entered any raffles yet."`, and `action={{ label: "Browse Raffles", href: "/home" }}`
    - For the won tab: pass the trophy SVG icon, title `"No wins yet"`, hint `"Keep entering raffles — your first win could be next!"`, and `action={{ label: "Browse Raffles", href: "/home" }}`
    - _Requirements: 2.11_

- [~] 5. Checkpoint — verify focus rings and EmptyState
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Add retry logic to `apiClient.ts`
  - [x] 6.1 Export `retryDelay(attempt: number): number` pure function — `Math.min(500 * Math.pow(2, attempt), 10_000)` — and a `sleep(ms: number): Promise<void>` helper using `setTimeout`
    - _Requirements: 3.8_

  - [x] 6.2 Add `shouldRetry(method: string, error: unknown, response?: Response): boolean` predicate: returns `true` only for GET method when `error` is a network throw (no response) or when `response.status` is 500–599
    - _Requirements: 3.1, 3.2, 3.4, 3.5_

  - [~] 6.3 Modify `apiRequest` to implement the one-retry flow using `retryDelay`, `sleep`, and `shouldRetry`
    - On attempt 0: catch network error or detect 5xx; if `shouldRetry` returns true, `await sleep(retryDelay(0))` then retry (suppress toast on this attempt only)
    - On attempt 1 (retry): let any failure proceed to the existing toast-and-throw path
    - Keep all existing behaviour for non-GET methods, 4xx, 401 token clearing, and empty-response handling unchanged
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.11_

- [ ] 7. Write property-based tests for `apiClient` retry logic in `client/src/services/apiClient.spec.ts`
  - [ ]* 7.1 Write property test for `retryDelay` formula
    - **Property 13: Retry delay formula is correct and capped**
    - **Validates: Requirements 3.8**
    - Use `fc.assert(fc.property(fc.nat(), ...))` with `numRuns: 100`

  - [ ]* 7.2 Write property tests for GET retry behaviour
    - **Property 3: GET retry on network error returns success body** — `Validates: Requirements 3.1, 3.7`
    - **Property 4: GET retry on 5xx returns success body** — `Validates: Requirements 3.2, 3.7`
    - **Property 5: GET exhausts retry on double failure** — `Validates: Requirements 3.3`
    - **Property 6: Non-GET methods never retry** — `Validates: Requirements 3.5`
    - Use `fc.assert(fc.asyncProperty(...))`, `vi.useFakeTimers()` / `vi.runAllTimersAsync()`, `vi.stubGlobal('fetch', ...)` matching `authService.spec.ts` pattern

  - [ ]* 7.3 Write toast-suppression property tests
    - **Property 14: No toast on successful retry** — `Validates: Requirements 3.11`
    - **Property 15: Toast fires exactly once on final failure** — `Validates: Requirements 3.11`
    - Spy on `toast.error` from `sonner` with `vi.spyOn`

  - [ ]* 7.4 Write example-based tests for edge cases
    - GET succeeds on first attempt — no retry, fetch called once
    - 4xx response — no retry, immediate error, fetch called once
    - Timeout abort (`AbortSignal`) treated as network error
    - _Requirements: 3.4, 3.6, 3.9_

- [~] 8. Checkpoint — verify retry logic and tests
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Update `CountdownTimer.tsx` with accessible announcer
  - [x] 9.1 Add `useRef<Set<string>>` (`announcedRef`) and `useState<string>` (`announcement`) to `CountdownTimer.tsx`
    - Wrap the existing visual `<div>` (and the expired badge `<div>`) with `aria-hidden="true"`
    - Add a sibling `<div className="sr-only" aria-live="polite" aria-atomic="true">` whose text content is bound to `announcement` state
    - _Requirements: 4.1, 4.2, 4.8_

  - [~] 9.2 Add a `useEffect` to `CountdownTimer.tsx` that fires whenever `{ days, hours, minutes, seconds, expired }` changes
    - Compute `totalSeconds = parseInt(days)*86400 + parseInt(hours)*3600 + parseInt(minutes)*60 + parseInt(seconds)`
    - Check milestones in specificity order (expired first, then 1-minute, then 10-minute, then 1-hour); for each milestone, set `announcement` and add its key to `announcedRef.current` only if the key is not already present
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 4.9, 4.10_

- [ ] 10. Write tests for `CountdownTimer` accessibility in `client/src/components/ui/CountdownTimer.spec.tsx`
  - [ ]* 10.1 Write structural property test
    - **Property 7: CountdownTimer always renders structural accessibility elements**
    - **Validates: Requirements 4.1, 4.2, 4.8**
    - Generate random future `endTime` values with `fc.integer({ min: 1, max: 7200 })` seconds ahead

  - [ ]* 10.2 Write milestone announcement tests (example-based, using `vi.useFakeTimers()`)
    - **Property 8: 1-hour milestone** — advance fake timers to cross 3600 s threshold — **Validates: Requirements 4.3**
    - **Property 9: 10-minute milestone** — advance to 600 s threshold — **Validates: Requirements 4.4**
    - **Property 10: 1-minute milestone** — advance to 60 s threshold — **Validates: Requirements 4.5**
    - **Property 11: Expiry announced exactly once** — use past `endTime`, verify "Raffle ended" set once — **Validates: Requirements 4.6, 4.7, 4.9**

  - [ ]* 10.3 Write empty live region property test
    - **Property 12: Live region is empty before first threshold**
    - **Validates: Requirements 4.10**
    - Generate `endTime` values more than 3600 s in the future; assert live region text is empty at initial render

- [~] 11. Final checkpoint — full test suite
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Focus-ring correctness (Req 1) is verified by code review; automated class checks are deliberately omitted per the design
- The four task groups (1–2, 3–4, 6–7, 9–10) are independent and can be executed in parallel
- All property tests use `fc.assert` / `fc.asyncProperty` from fast-check with `numRuns: 100`
- `vi.useFakeTimers()` / `vi.runAllTimersAsync()` must bracket each retry and countdown test to avoid real sleeps

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["3.1", "6.1"] },
    { "id": 1, "tasks": ["3.2", "4.1", "4.2", "4.3", "6.2", "9.1"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3", "2.4", "6.3", "9.2"] },
    { "id": 3, "tasks": ["7.1", "7.2", "7.3", "7.4", "10.1", "10.2", "10.3"] }
  ]
}
```
