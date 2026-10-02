# Lighthouse CI - Performance Budgets

## Overview

This project uses [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) to enforce performance budgets and track Core Web Vitals across pull requests.

Two separate profiles are run — desktop and mobile — each auditing the key app routes. Per-route assertion budgets are applied so data-heavy pages, such as the raffle detail view, are held to realistic thresholds rather than the landing page's tighter numbers.

## Audited Routes

| Route           | Purpose                                         |
| --------------- | ----------------------------------------------- |
| `/`             | Landing page                                    |
| `/home`         | Raffle list                                     |
| `/raffles/9001` | Seeded raffle detail (deterministic demo route) |
| `/leaderboard`  | Leaderboard                                     |
| `/create`       | Create raffle form                              |

The seeded demo route is backed by the shared fixture catalog used by the indexer and Playwright test suite, so the app renders the same raffle, ticket counts, and participant data across CI runs. The preview seed can force `VITE_DEMO_MODE=true` before build/start so the detail view does not rely on a live backend.

## Performance Budgets

### Desktop (lighthouserc.desktop.json)

Throttling: 40 ms RTT · 10 Mbps · CPU ×1

| Route           | LCP (error) | CLS (error) | FCP (warn) | Perf score (error) |
| --------------- | ----------- | ----------- | ---------- | ------------------ |
| `/`             | 2 200 ms    | 0.10        | 1 800 ms   | ≥ 0.92             |
| `/home`         | 2 800 ms    | 0.10        | 2 000 ms   | ≥ 0.88             |
| `/raffles/9001` | 3 200 ms    | 0.12        | 2 200 ms   | ≥ 0.85             |
| `/leaderboard`  | 2 800 ms    | 0.10        | 2 000 ms   | ≥ 0.88             |
| `/create`       | 2 800 ms    | 0.10        | 2 000 ms   | ≥ 0.88             |

### Mobile (lighthouserc.mobile.json)

Throttling: 150 ms RTT · 1.6 Mbps · CPU ×4 (Moto G Power equivalent)
Screen: 412 × 915 px · 2.625 DPR

| Route           | LCP (error) | CLS (error) | FCP (warn) | Perf score (error) |
| --------------- | ----------- | ----------- | ---------- | ------------------ |
| `/`             | 4 000 ms    | 0.10        | 2 500 ms   | ≥ 0.75             |
| `/home`         | 5 000 ms    | 0.12        | 3 000 ms   | ≥ 0.70             |
| `/raffles/9001` | 6 000 ms    | 0.15        | 3 500 ms   | ≥ 0.65             |
| `/leaderboard`  | 5 000 ms    | 0.12        | 3 000 ms   | ≥ 0.70             |
| `/create`       | 5 000 ms    | 0.12        | 3 000 ms   | ≥ 0.70             |

> Accessibility, Best Practices, and SEO category scores are set to warn ≥ 0.9 for both profiles.

## Scripts

```bash
# Build then audit both desktop and mobile (what CI runs)
pnpm run lighthouse:local

# Audit only (requires an already-built dist/)
pnpm run lighthouse

# Individual profiles
pnpm run lighthouse:desktop
pnpm run lighthouse:mobile

# Preview server using the LHCI seed mode (no backend required)
pnpm run preview:lhci
```

## CI Integration

The Lighthouse CI job runs on every pull request and push to master:

1. Runs `scripts/seed-preview-raffle.js` to write the preview seed env or otherwise enable the demo dataset.
2. Builds the client (`tsc -b && vite build`).
3. Runs the desktop audit for the configured routes, asserting the per-route budgets and uploading the report.
4. Runs the mobile audit with realistic throttling and viewport characteristics.

**Error** assertions fail the build. **Warning** assertions appear in the report but do not block the merge.

## Deterministic Detail Page

The raffle detail page (`/raffles/:id`) fetches live data in production. For CI and deterministic client/demo testing, we seed the detail view with a static fixture so the audit is stable across runs:

- The shared fixture catalog defines the seeded raffle ids (including `9001`).
- `VITE_DEMO_MODE=true` switches the client to the shared mock/demo data path.
- The preview/lighthouse seed script ensures the build has stable raffle, ticket, and participant responses without a live backend.
- The route is validated in CI with the same data used by the indexer seeder and the Playwright smoke/spec fixtures.

If the app adds a new demo raffle or changes the seed route, update the fixture definition and the route URLs in the Lighthouse configs together.

## Configuration Files

| File                             | Purpose                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `lighthouserc.desktop.json`      | Desktop profile — five routes, per-route assertMatrix                              |
| `lighthouserc.mobile.json`       | Mobile profile — same routes, realistic mobile throttling                          |
| `lighthouserc.json`              | Legacy stub — kept for compatibility; active profiles are the desktop/mobile files |
| `scripts/seed-preview-raffle.js` | Writes the preview seed env before the build                                       |

## Performance Optimization Tips

### Improving LCP

- Use modern image formats (WebP / AVIF), set explicit `width`/`height`, and add `fetchpriority="high"` on the hero image.
- Code-split and defer non-critical JS.
- Preload critical fonts and set `font-display: swap`.

### Improving CLS

- Always set explicit dimensions on images and embeds.
- Reserve space with aspect-ratio boxes for async content.
- Avoid injecting content above the fold after initial render.

### Improving TBT / TTI

- Break up long tasks with code splitting and dynamic imports.
- Move heavy computation off the main thread with web workers.
- Remove unused code and defer third-party scripts.

## Resources

- [Lighthouse CI Documentation](https://github.com/GoogleChrome/lighthouse-ci)
- [Web Vitals](https://web.dev/vitals/)
- [assertMatrix reference](https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md#assertmatrix)
- [Optimize LCP](https://web.dev/optimize-lcp/)
- [Optimize CLS](https://web.dev/optimize-cls/)
