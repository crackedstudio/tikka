# Lighthouse CI - Performance Budgets

## Overview

This project uses [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) to enforce performance budgets and track Core Web Vitals across pull requests.

Two separate profiles are run — **desktop** and **mobile** — each auditing the five primary routes of the app. Per-route assertion budgets are applied so data-heavy pages (like the raffle detail) are held to realistic thresholds rather than the landing page's tighter numbers.

## Audited Routes

| Route | Purpose |
|-------|---------|
| `/` | Landing page |
| `/home` | Raffle list (data-heavy) |
| `/raffles/101` | Raffle detail (heaviest page) |
| `/leaderboard` | Leaderboard |
| `/create` | Create raffle form |

The detail page uses the deterministic seed raffle (ID 101 — "Tesla Model 3 Performance") from `src/data/demoRaffles.ts`. The seed script (`scripts/seed-preview-raffle.js`) writes a `.env.lhci` file that forces `VITE_USE_DEMO_DATA=true` so the preview build renders the page without a live backend.

## Performance Budgets

### Desktop (lighthouserc.desktop.json)

Throttling: 40 ms RTT · 10 Mbps · CPU ×1

| Route | LCP (error) | CLS (error) | FCP (warn) | Perf score (error) |
|-------|-------------|-------------|------------|-------------------|
| `/` | 2 200 ms | 0.10 | 1 800 ms | ≥ 0.92 |
| `/home` | 2 800 ms | 0.10 | 2 000 ms | ≥ 0.88 |
| `/raffles/101` | 3 200 ms | 0.12 | 2 200 ms | ≥ 0.85 |
| `/leaderboard` | 2 800 ms | 0.10 | 2 000 ms | ≥ 0.88 |
| `/create` | 2 800 ms | 0.10 | 2 000 ms | ≥ 0.88 |

### Mobile (lighthouserc.mobile.json)

Throttling: 150 ms RTT · 1.6 Mbps · CPU ×4 (Moto G Power equivalent)  
Screen: 412 × 915 px · 2.625 DPR

| Route | LCP (error) | CLS (error) | FCP (warn) | Perf score (error) |
|-------|-------------|-------------|------------|-------------------|
| `/` | 4 000 ms | 0.10 | 2 500 ms | ≥ 0.75 |
| `/home` | 5 000 ms | 0.12 | 3 000 ms | ≥ 0.70 |
| `/raffles/101` | 6 000 ms | 0.15 | 3 500 ms | ≥ 0.65 |
| `/leaderboard` | 5 000 ms | 0.12 | 3 000 ms | ≥ 0.70 |
| `/create` | 5 000 ms | 0.12 | 3 000 ms | ≥ 0.70 |

> Accessibility, Best Practices, and SEO category scores are set to `warn ≥ 0.9` for all routes on both profiles.

## Scripts

```bash
# Build then audit both desktop and mobile (what CI runs)
pnpm run lighthouse:local

# Audit only (requires an already-built dist/)
pnpm run lighthouse

# Individual profiles
pnpm run lighthouse:desktop
pnpm run lighthouse:mobile

# Preview server using the LHCI seed env (no backend required)
pnpm run preview:lhci
```

## CI Integration

The Lighthouse CI job runs on every pull request and push to master:

1. Runs `scripts/seed-preview-raffle.js` to write `.env.lhci`
2. Builds the client (`tsc -b && vite build`)
3. Runs the **desktop** audit — starts `vite preview --mode lhci`, audits five routes × 3 runs, asserts per-route budgets, uploads reports
4. Runs the **mobile** audit — same flow with mobile throttling and screen emulation

**Error** assertions fail the build. **Warning** assertions appear in the report but do not block the merge.

### When CI Fails

1. Open the Lighthouse report linked in the PR comment
2. Identify which route/profile/metric is failing
3. Optimize (see "Performance Optimization Tips" below)
4. Verify locally with `pnpm run lighthouse:local`

## Deterministic Detail Page

The raffle detail page (`/raffles/:id`) fetches live data in production. For CI, we seed it with a static fixture so the audit is stable across runs:

- `scripts/seed-preview-raffle.js` writes `.env.lhci` with `VITE_USE_DEMO_DATA=true`
- Vite loads this via `--mode lhci` during the preview server start
- `src/data/demoRaffles.ts` ID 101 ("Tesla Model 3 Performance") is used
- `.env.lhci` is git-ignored; it is regenerated each CI run

If the app adds a new demo raffle or changes ID 101, update both `demoRaffles.ts` and the URL in `lighthouserc.desktop.json` / `lighthouserc.mobile.json`.

## Configuration Files

| File | Purpose |
|------|---------|
| `lighthouserc.desktop.json` | Desktop profile — five routes, per-route assertMatrix |
| `lighthouserc.mobile.json` | Mobile profile — same routes, realistic mobile throttling |
| `lighthouserc.json` | Legacy stub — points to the new files; no longer used by scripts |
| `scripts/seed-preview-raffle.js` | Writes `.env.lhci` before the build |

## Performance Optimization Tips

### Improving LCP
- Use modern image formats (WebP / AVIF), set explicit `width`/`height`, add `fetchpriority="high"` on the hero image
- Code-split and defer non-critical JS
- Preload critical fonts; set `font-display: swap`

### Improving CLS
- Always set explicit dimensions on images and embeds
- Reserve space with aspect-ratio boxes for async content
- Avoid injecting content above the fold after initial render

### Improving TBT / TTI
- Break up long tasks with code splitting and dynamic imports
- Move heavy computation off the main thread (web workers)
- Remove unused code; defer third-party scripts

## Resources

- [Lighthouse CI Documentation](https://github.com/GoogleChrome/lighthouse-ci)
- [Web Vitals](https://web.dev/vitals/)
- [assertMatrix reference](https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md#assertmatrix)
- [Optimize LCP](https://web.dev/optimize-lcp/)
- [Optimize CLS](https://web.dev/optimize-cls/)
