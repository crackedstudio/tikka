# #831 — Escape key to close mobile nav menu

- **Requested:** in `client/src/components/Navbar.tsx`, close the mobile nav
  on `Escape`, return focus to the hamburger toggle button on close, add a
  backdrop that also closes the menu on click, and cover the Escape path in
  `Navbar.spec.tsx` with Playwright — for WCAG 2.1 §2.1.2 (No Keyboard Trap).

## Investigation

Before implementing anything, checked whether this was already done:

- `client/src/components/Navbar.tsx` on `upstream/master`
  (`crackedstudio/tikka`) already implements this, via commit `a567df2` —
  `"Fix/831 escape mobile nav (#882)"`.
- Read the current implementation and confirmed all three acceptance
  criteria are met:
  - A `useEffect` keydown listener closes the menu when `e.key === "Escape"`
    (labelled in-code as the WCAG 2.1 §2.1.2 fix).
  - `hamburgerRef` (a ref on the toggle button) receives `.focus()` inside
    `closeMenu()`, so focus returns to the trigger on every close path —
    Escape, backdrop click, or otherwise.
  - A `data-testid="mobile-nav-backdrop"` overlay sits behind the mobile
    panel with `onClick={closeMenu}`.
- `client/src/components/Navbar.spec.tsx` on `upstream/master` includes all
  three cases by name: `'pressing Escape closes the open mobile menu'`,
  `'Escape returns focus to the hamburger trigger button'`, and
  `'clicking the backdrop closes the mobile menu'`.

Note: the issue asked for Playwright coverage specifically, but the tests
that landed are React Testing Library unit tests
(`fireEvent.keyDown`/`fireEvent.click`) in `Navbar.spec.tsx`, not a
Playwright E2E spec. They exercise the exact same behavior the acceptance
criteria describe (Escape closes the menu, focus returns to the trigger,
backdrop click closes the menu), just at the unit-test layer rather than
E2E — worth flagging in case the reporter specifically wants an additional
Playwright-level regression test, but the underlying behavior itself is
implemented and covered.

## Conclusion

**No new implementation was needed.** #831's underlying acceptance criteria
are already met on `upstream/master`. This note exists so #831 can be closed
referencing commit `a567df2` (PR #882) instead of sitting open with no
record connecting it to the code that already satisfies it — noting the
Playwright-vs-unit-test distinction above in case that specific coverage
gap still matters to the reporter.

## Re-verifying

```bash
git log upstream/master --oneline -- client/src/components/Navbar.tsx
git show a567df2 --stat
npx vitest run client/src/components/Navbar.spec.tsx   # once deps are installed
```
