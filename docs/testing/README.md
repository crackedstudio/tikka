# Testing

Shared testing strategy for the Tikka monorepo. Use this directory as the canonical reference for **what to test**, **where tests live**, and **which CI tier runs them**.

| Document | Purpose |
|----------|---------|
| [STRATEGY.md](./STRATEGY.md) | Full test strategy: types, package ownership, when to add tests, CI tiers, commands |

## Quick reference

| Package | Directory | Unit | Integration | E2E | Property | Contract compat | Smoke |
|---------|-----------|:----:|:-----------:|:---:|:--------:|:---------------:|:-----:|
| **client** | `client/` | Vitest (`*.spec.ts(x)`) | — | Playwright (`tests/e2e/`) | — | via SDK mocks in unit | manual / `tier-2-scheduled` |
| **backend** | `backend/` | Jest (`src/**/*.spec.ts`) | — | Jest (`test/*.e2e-spec.ts`) | — | — | curl / health (manual) |
| **indexer** | `indexer/` | Jest (`src/**/*.spec.ts`) | Jest (`*.integration.spec.ts`) | — | — | event parser fixtures | `/health` |
| **oracle** | `oracle/` | Jest (`**/*.spec.ts`) | planned (testnet) | — | fast-check (listener) | PRNG/VRF shape tests | `/health` |
| **sdk** | `sdk/` | Jest (`src/**/*.spec.ts`) | mocked RPC (`src/test/`) | — | — | bindings + lifecycle specs | CLI examples |

**Cross-package change:** run checks in every touched package, then `npm run build` from the repo root.

See [STRATEGY.md](./STRATEGY.md) for CI tier definitions (`tier-0-pr`, `tier-1-merge`, `tier-2-scheduled`) that GitHub Actions workflows should reference.
