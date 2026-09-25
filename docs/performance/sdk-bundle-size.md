# SDK Bundle Size Baseline

Bundle-size budgets for the `@tikka/sdk` entry points (`.`, `./light`, `./network`).
Budgets are declared in `sdk/package.json` under `size-limit` and enforced by `pnpm run size-check`.

`size-limit` measures each entry **minified and gzipped, including its dependencies**, except
modules listed in that entry's `ignore` array (externalised, not counted).

## Baseline (2026-09-25, `master`)

Measured with `pnpm run build && pnpm run build:read && pnpm run build:light`, then `pnpm run size-check`.

| Entry            | Bundle path                              | Size (min+gz) | Budget (bytes) |
| ---------------- | ---------------------------------------- | ------------: | -------------: |
| `@tikka/sdk (.)` | `dist/esm/index.js`                      |   394.20 kB   |        450000  |
| `@tikka/sdk/light`| `dist/light/index.light.js`              |   104.57 kB   |        120000  |
| `@tikka/sdk/network`| `dist/esm/network/circuit-breaker.js`    |      583 B    |          2000  |

Exact byte counts: `.` = 394202 B, `./light` = 104572 B, `./network` = 583 B.

## What each entry is

- **`.` (`dist/esm/index.js`)** — the full server SDK (NestJS runtime, transport, auth). Node
  builtins `crypto` and `stream` are externalised via `ignore`; everything else in the graph
  counts toward the budget.
- **`./light` (`dist/light/index.light.js`)** — the browser/edge entry point. Its entire value is
  being smaller than the main entry, so it must never pull in `@nestjs/*`.
- **`./network` (`dist/esm/network/circuit-breaker.js`)** — the standalone network/circuit-breaker
  export.

## Enforcement

- **SDK CI job** (`.github/workflows/ci.yml`):
  - `Check bundle size budgets` — runs `pnpm size-check --json`, publishes the table above to the
    job step summary via `pnpm run bundle:report`, and fails the job when any entry is over budget.
  - `Assert light bundle has no NestJS code` — runs `pnpm run bundle:assert-light`, which rebuilds
    the light bundle with esbuild and fails if any `node_modules/@nestjs/*` module appears in its
    module graph or in the emitted output.
- **Release workflow** (`.github/workflows/release.yml`) re-runs `pnpm size-check` before publishing.

## Regenerating this baseline

```bash
cd sdk
pnpm run build && pnpm run build:read && pnpm run build:light
pnpm run size-check
pnpm run bundle:report          # markdown table (writes to $GITHUB_STEP_SUMMARY in CI)
pnpm run bundle:assert-light    # NestJS absence assertion
```

Update the table in this file whenever a budget is deliberately changed, and record the reason in
the PR that changes it.
