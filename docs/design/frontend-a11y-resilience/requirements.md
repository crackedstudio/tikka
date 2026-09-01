# Requirements Document

## Introduction

This document specifies four improvements to the Tikka raffle platform frontend (`client/src/`). The platform is built with React 19, TypeScript, Tailwind CSS v4, Vitest, and fast-check.

The four improvements are:

1. **Global Visible Focus Indicators** — all interactive elements must expose an explicit, high-contrast `focus-visible` ring so keyboard users can always identify where focus sits, regardless of browser default outline behavior.
2. **Reusable `EmptyState` Component** — a single shared component replaces three hand-rolled empty-state blocks across Search, Leaderboard, and MyRaffles, making empty-state UI consistent and maintainable.
3. **API Client Retry Logic + Tests** — idempotent GET requests automatically retry once on network failure or 5xx responses with exponential backoff; a comprehensive property-based test suite is added to `apiClient.spec.ts`.
4. **Accessible Countdown Announcer** — `CountdownTimer.tsx` exposes a visually-hidden `aria-live` region that announces four meaningful milestones to screen reader users while the visual ticking digits are silenced from the accessibility tree.

## Glossary

- **ApiClient**: The module at `client/src/services/apiClient.ts` that wraps `fetch` with base URL resolution, timeout via `AbortSignal.timeout`, JWT injection, sonner toast notifications, and the `api.get/post/put/delete` convenience helpers.
- **CountdownTimer**: The React component at `client/src/components/ui/CountdownTimer.tsx` that renders live dd/hh/mm/ss ticking spans using the `useCountdown` hook.
- **EmptyState**: The new shared React component to be created at `client/src/components/ui/EmptyState.tsx`.
- **Focus_Ring**: The explicit Tailwind CSS utility classes `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF389C] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#11172E]` that produce a high-contrast pink ring on keyboard focus.
- **Interactive_Element**: Any rendered HTML element that accepts keyboard interaction — `<button>`, `<a>`, `<input>`, `<select>`, `<textarea>`, or any element with `tabIndex >= 0`.
- **Milestone**: One of four timed checkpoints at which the CountdownTimer must announce to screen readers — 1 hour remaining, 10 minutes remaining, 1 minute remaining, and raffle ended.
- **Network_Error**: A `fetch` call that rejects (e.g., DNS failure, connection refused) or is aborted by `AbortSignal.timeout`.
- **Retry_Delay**: The wait duration before a retry attempt. The base delay is 500 ms for the first retry and doubles for each subsequent retry (exponential backoff).
- **Server_Error**: An HTTP response whose status code is in the range 500–599 (inclusive).
- **Token_Store**: The `sessionStorage` key `tikka_auth_token` used by ApiClient to persist the JWT.
- **useCountdown**: The React hook at `client/src/hooks/useCountdown.ts` that returns `{ days, hours, minutes, seconds, expired }`.
- **Visually_Hidden**: A CSS technique (equivalent to Tailwind's `sr-only` class) that removes an element from the visual layout while keeping it in the accessibility tree.

---

## Requirements

### Requirement 1: Global Visible Focus Indicators

**User Story:** As a keyboard user, I want every interactive element to display a visible focus ring when I navigate with the keyboard, so that I can always tell which element is focused without relying on the browser's suppressed default outline.

#### Acceptance Criteria

1. THE Focus_Ring classes SHALL be applied to every Interactive_Element rendered by `WalletButton.tsx`, `SignInButton.tsx`, and `Breadcrumbs.tsx`.
2. THE Focus_Ring classes SHALL be applied to every `<button>` and `<a>` element rendered by `Leaderboard.tsx`, `Search.tsx`, `MyRaffles.tsx`, and `LeaderboardSection.tsx` (including the pagination buttons in MyRaffles and the sort buttons in Leaderboard).
3. THE Focus_Ring SHALL be applied via `focus-visible:` variants only, so mouse users are not shown the ring on click.
4. WHEN an Interactive_Element is in both a light-mode and dark-mode context, THE Focus_Ring SHALL remain visible in both contexts using `focus-visible:ring-offset-white` for light mode and `dark:focus-visible:ring-offset-[#11172E]` for dark mode; IF only one offset color is applied and the other context is missing, THE Focus_Ring SHALL fall back to a default visible ring that works in any context so the element is never invisible to keyboard users.
5. THE Interactive_Element SHALL include `focus-visible:outline-none` to suppress the native browser outline whenever an explicit Focus_Ring is added.

---

### Requirement 2: Reusable `EmptyState` Component

**User Story:** As a developer, I want a single shared EmptyState component, so that I can render consistent, accessible empty-state UI across pages without duplicating markup.

#### Acceptance Criteria

1. THE EmptyState SHALL accept a required `icon` prop of type `ReactNode` to render an illustrative icon or graphic.
2. THE EmptyState SHALL accept a required `title` prop of type `string` to render a heading that names the empty context.
3. THE EmptyState SHALL accept an optional `hint` prop of type `string` to render a secondary descriptive sentence below the title.
4. THE EmptyState SHALL accept an optional `action` prop that describes a single call-to-action; WHEN `action.href` is provided, THE EmptyState SHALL render the CTA as an `<a>` element; WHEN `action.onClick` is provided instead, THE EmptyState SHALL render the CTA as a `<button>` element.
5. THE EmptyState `title` SHALL be rendered as an `<h3>` element with `role` inherited from its heading level, so screen readers announce it as a section heading.
6. THE EmptyState CTA element SHALL carry the Focus_Ring classes defined in Requirement 1.
7. WHEN `action` is omitted, THE EmptyState SHALL render without any CTA element.
8. WHEN both `action.href` and `action.onClick` are provided to the same action prop, THE EmptyState SHALL render the CTA as an `<a>` element (href takes precedence).
9. THE Search page SHALL replace its hand-rolled empty-state block with the EmptyState component, passing the existing animated search icon, title "No raffles found", the contextual hint text, and a "Go Back" button action with `onClick` navigating to `/home`.
10. THE Leaderboard page SHALL replace its hand-rolled empty-state block with the EmptyState component, passing the existing list icon, title "No Leaderboard Data Yet", and the existing hint text (no CTA required).
11. THE MyRaffles page SHALL replace both its hand-rolled empty-state blocks (participated tab and won tab) with the EmptyState component, passing the appropriate icon, tab-specific title, tab-specific hint, and a "Browse Raffles" link action with `href="/home"`.

---

### Requirement 3: API Client Retry Logic and Tests

**User Story:** As a user on a flaky network, I want GET requests to automatically retry once before surfacing an error, so that transient network failures and server hiccups do not immediately break my experience.

#### Acceptance Criteria

1. WHEN a GET request encounters a Network_Error, THE ApiClient SHALL wait for one Retry_Delay period and then retry the request exactly once before propagating the error.
2. WHEN a GET request receives a Server_Error response, THE ApiClient SHALL wait for one Retry_Delay period and then retry the request exactly once before propagating the error.
3. WHEN a retried GET request also fails with a Network_Error or Server_Error, THE ApiClient SHALL propagate the error without making any further retry attempts.
4. WHEN a GET request receives a 4xx response (status 400–499), THE ApiClient SHALL NOT retry and SHALL propagate the error immediately.
5. WHEN a POST, PUT, or DELETE request fails with a Network_Error or Server_Error, THE ApiClient SHALL NOT retry and SHALL propagate the error immediately.
6. WHEN the original GET request succeeds, THE ApiClient SHALL NOT perform any retry and SHALL return the parsed response body.
7. WHEN the first GET attempt fails and the retry succeeds, THE ApiClient SHALL return the parsed response body from the retry response.
8. THE Retry_Delay SHALL be implemented using a 500 ms base delay multiplied by 2 raised to the power of the attempt index (attempt 0 = 500 ms, attempt 1 = 1000 ms), capped at a maximum of 10 000 ms; WHEN the calculated delay is an invalid value (e.g., resulting from a numeric edge case), THE ApiClient SHALL use the computed value as-is without substituting a fallback.
9. WHEN `apiClient.spec.ts` is executed, THE ApiClient test suite SHALL cover: timeout abort (Network_Error), typed error parsing (message and status fields), single retry behavior on Network_Error, single retry behavior on Server_Error, no retry on 4xx responses, no retry on non-GET methods (POST, PUT, DELETE), and successful first-attempt responses.
10. THE `apiClient.spec.ts` test suite SHALL use `fc.assert` with `fc.asyncProperty` from fast-check and `vi.stubGlobal('fetch', ...)` from Vitest, matching the pattern established in `authService.spec.ts`.
11. WHEN the retry mechanism fires and the retried request succeeds, THE ApiClient SHALL NOT show any toast notification, keeping users unaware of the transient failure; WHEN the retry mechanism fires and the retried request also fails, THE ApiClient SHALL show a toast notification exactly once for the final failure.

---

### Requirement 4: Accessible Countdown Announcer

**User Story:** As a screen reader user, I want the countdown timer to announce important milestones in natural language, so that I am informed of approaching deadlines without being overwhelmed by every tick of the clock.

#### Acceptance Criteria

1. THE CountdownTimer visual display container (the `<div>` wrapping the dd/hh/mm/ss spans) SHALL carry `aria-hidden="true"` so screen readers do not read out every second change.
2. THE CountdownTimer SHALL render a Visually_Hidden `<div>` with `aria-live="polite"` and `aria-atomic="true"` alongside the visual display.
3. WHEN time remaining crosses the 1-hour threshold (i.e., the total remaining seconds drop to or below 3600 for the first time), THE CountdownTimer SHALL set the live region text to "1 hour remaining".
4. WHEN time remaining crosses the 10-minute threshold (i.e., the total remaining seconds drop to or below 600 for the first time), THE CountdownTimer SHALL set the live region text to "10 minutes remaining".
5. WHEN time remaining crosses the 1-minute threshold (i.e., the total remaining seconds drop to or below 60 for the first time), THE CountdownTimer SHALL set the live region text to "1 minute remaining".
6. WHEN the countdown expires (i.e., `expired` becomes `true` for the first time), THE CountdownTimer SHALL set the live region text to "Raffle ended".
7. WHEN a Milestone has been announced, THE CountdownTimer SHALL NOT announce the same Milestone again for the same countdown instance.
8. THE Visually_Hidden live region SHALL use Tailwind's `sr-only` class (or equivalent inline styles) so it occupies no visible space but remains in the accessibility tree.
9. WHEN a `CountdownTimer` is rendered with an end time already in the past, THE CountdownTimer SHALL immediately set the live region to "Raffle ended".
10. WHEN a `CountdownTimer` is rendered with an end time more than 1 hour in the future, THE CountdownTimer SHALL render with an empty live region until a Milestone threshold is first crossed.
