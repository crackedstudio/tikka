# #828 — Countdown timer accuracy fix for sub-second drift

- **Requested:** replace `client/src/hooks/useCountdown.ts`'s `setInterval`
  approach (which accumulates ~1s/hour of drift) with a
  `requestAnimationFrame` loop that re-syncs to `Date.now()` every frame and
  recomputes remaining time from `endTime` on every tick, plus a
  `vi.useFakeTimers()` unit test advancing 1 hour and asserting the display
  is accurate to within 1 second.

## Investigation

Before implementing anything, checked whether this was already done:

- `client/src/hooks/useCountdown.ts` on `upstream/master`
  (`crackedstudio/tikka`) already implements this, via commit `eed057c` —
  `"Fix/828 countdown raf drift (#880)"`.
- Read the current implementation and confirmed it satisfies both acceptance
  criteria:
  - `calculate()` computes `diff = targetMs - Date.now()` fresh on every
    call — the display is recomputed from `endTime` each tick, never
    decremented from a stored counter.
  - The tick loop drives itself with `requestAnimationFrame` (no
    `setInterval` anywhere in the file), so there is no fixed-interval
    drift to accumulate.
  - React re-renders are only triggered when the displayed *second* value
    actually changes (`lastSecRef`), avoiding a 60fps re-render cascade —
    a reasonable refinement beyond the issue's literal ask.
  - `document.visibilitychange` handling re-syncs immediately when a
    backgrounded tab regains focus, closing the classic RAF-throttled-tabs
    gap.
- `client/src/hooks/useCountdown.spec.ts` on `upstream/master` includes
  `it('displays accurate remaining time after advancing fake clock by 1
  hour — no drift', ...)`, using `vi.useFakeTimers()` +
  `vi.advanceTimersByTime(60 * 60 * 1000)`, asserting the resulting display
  reads `01:00` hours/minutes and `Number(seconds) <= 1` — exactly the
  acceptance criterion in the issue, plus additional coverage for
  initialization, past-`endTime` expiry, and clean expiry as the clock
  crosses `endTime`.

Two local-only branches from an earlier, pre-merge pass at this same issue
(`fix/828-countdown-raf-drift`, `fix/828-countdown-raf-drift-v2`) exist in
this checkout; both are now superseded by the merged fix and were not used
for this verification.

## Conclusion

**No new implementation was needed.** #828's acceptance criteria are already
met on `upstream/master`. This note exists so #828 can be closed referencing
commit `eed057c` (PR #880) instead of sitting open with no record connecting
it to the code that already satisfies it.

## Re-verifying

```bash
git log upstream/master --oneline -- client/src/hooks/useCountdown.ts
git show eed057c --stat
npx vitest run client/src/hooks/useCountdown.spec.ts   # once deps are installed
```
