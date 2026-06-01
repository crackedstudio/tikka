# Tikka Test Strategy

This document defines how automated and manual testing is organized across the Tikka monorepo. It is the source of truth for contributors and for CI workflow configuration.

**Scope:** `client`, `backend`, `indexer`, `oracle`, and `sdk` in this repository. Soroban contract tests live in the separate `tikka-contracts` repo (`cargo test` / Soroban test harness).

---

## Goals

1. Every package has a clear owner for each test type.
2. Contributors know **where** to put new tests and **when** each type is required.
3. CI runs fast checks on every PR and slower checks on a schedule or after merge.
4. Workflows reference the tier IDs defined here (`tier-0-pr`, `tier-1-merge`, `tier-2-scheduled`).

---

## Test types

| Type | Purpose | Typical runtime | Infrastructure |
|------|---------|-----------------|----------------|
| **Unit** | Isolated logic; dependencies mocked | seconds | none |
| **Integration** | Real I/O (DB, queue, RPC) with controlled fixtures | minutes | Docker, Testcontainers, or testnet |
| **E2E** | Full HTTP or browser flows across layers | minutes | app bootstrapped in test; mocks at boundaries |
| **Property** | Invariants hold across generated inputs | seconds–minutes | fast-check (oracle today) |
| **Contract compatibility** | SDK/oracle payloads match Soroban interface | seconds | mocked RPC + typed bindings |
| **Smoke** | Deployed or local service responds correctly | seconds | running stack or curl against `/health` |

### Naming conventions

| Pattern | Location | Runner |
|---------|----------|--------|
| `*.spec.ts` / `*.spec.tsx` | Co-located under `src/` (oracle also uses top-level `test/`) | Jest or Vitest |
| `*.integration.spec.ts` | `indexer/src/test/integration/` | Jest + Testcontainers |
| `*.e2e-spec.ts` | `backend/test/` | Jest + supertest |
| Playwright specs | `client/tests/e2e/*.spec.ts` | Playwright |

Do **not** use `*.test.ts` in this repo — existing tooling matches `*.spec.ts` only.

---

## Package ownership

### Client (`client/`)

**Stack:** React, Vite, Vitest, Playwright.

| Test type | Owner | Where to add | Command |
|-----------|-------|--------------|---------|
| Unit | client | `client/src/**/*.spec.ts(x)` next to the component/hook | `npm run test` |
| E2E | client | `client/tests/e2e/` | `npm run test:e2e` |
| Integration | — | Not implemented; use unit + E2E | — |
| Contract compat | sdk (consumed) | Client tests mock API/SDK; no on-chain tests here | — |
| Smoke | manual | Dev server + critical paths | `npm run dev` + Playwright subset (`tier-2-scheduled`) |

**When to add tests**

| Change | Required | Suggested test |
|--------|----------|----------------|
| React component / hook | Unit | Render + interaction with `@testing-library/react` |
| Routing / auth UX | E2E | Playwright with `VITE_TEST_MODE=true` (see `playwright.config.ts`) |
| Styling-only | Optional unit snapshot | Skip if purely visual |
| SDK call wiring | Unit mock + optional E2E | Mock `@tikka/sdk` or network in Vitest |

**Config:** `client/vitest.config.ts`, `client/playwright.config.ts`, `client/src/setupTests.ts`.

---

### Backend (`backend/`)

**Stack:** NestJS, Fastify, Jest, supertest.

| Test type | Owner | Where to add | Command |
|-----------|-------|--------------|---------|
| Unit | backend | `backend/src/**/*.spec.ts` | `pnpm test` |
| E2E | backend | `backend/test/*.e2e-spec.ts` | `pnpm run test:e2e` |
| Integration | backend (future) | Against real Supabase/Redis — not yet wired | — |
| Smoke | manual | Rate limit + health (see `backend/README.md`) | curl loops / `GET /health` |

**When to add tests**

| Change | Required | Suggested test |
|--------|----------|----------------|
| Service / controller logic | Unit | `@nestjs/testing` module with mocked deps |
| Auth, guards, filters | Unit + E2E | `auth-protected.e2e-spec.ts`, `security.e2e-spec.ts` patterns |
| New REST route | Unit for service; E2E if auth/rate-limit behavior | supertest against bootstrapped app |
| Env validation | Unit | `env.schema.spec.ts` pattern |
| Push / email / storage | Unit with provider mocked | existing `*.service.spec.ts` patterns |

**Config:** Jest inline in `backend/package.json`; E2E in `backend/test/jest-e2e.json`.

**CI today:** `.github/workflows/backend.yml` runs build + unit tests only (`pnpm run test -- --ci`).

---

### Indexer (`indexer/`)

**Stack:** NestJS, PostgreSQL, Redis, Jest, Testcontainers.

| Test type | Owner | Where to add | Command |
|-----------|-------|--------------|---------|
| Unit | indexer | `indexer/src/**/*.spec.ts` (excludes `integration` in default `test` script) | `pnpm test` |
| Integration | indexer | `indexer/src/test/integration/*.integration.spec.ts` | `pnpm run test:integration` |
| Property | — | Not used yet | — |
| Smoke | ops | `GET /health` + `pnpm run status` CLI | manual / `tier-2-scheduled` |

**When to add tests**

| Change | Required | Suggested test |
|--------|----------|----------------|
| Event parsing / handlers | Unit | `event-parser.service.spec.ts`, `event-handler-registry.service.spec.ts` |
| Ingestion pipeline / cursor | Integration | Testcontainers PG via `src/test/integration/helpers/db-container.ts` |
| Migrations / schema | Integration | Run against container DB in integration suite |
| Cache / health | Unit | existing health + cache specs |
| Maintenance scripts | Unit | `archive-raffle-events.spec.ts` pattern |

**Prerequisites for integration:** Docker running (Testcontainers pulls `postgres` image).

**Config:** `indexer/jest.integration.config.js` — serial workers, 180s timeout.

---

### Oracle (`oracle/`)

**Stack:** NestJS, Bull/Redis, Stellar SDK, Jest, fast-check.

| Test type | Owner | Where to add | Command |
|-----------|-------|--------------|---------|
| Unit | oracle | `oracle/test/*.spec.ts` and `oracle/src/**/*.spec.ts` | `pnpm test` |
| Property | oracle | Co-located with unit (e.g. `event-listener.service.spec.ts`) | `pnpm test` |
| Integration | oracle (planned) | Future: Stellar testnet RPC (see `oracle/README.md`) | — |
| Contract compat | oracle + sdk | PRNG/VRF output shapes (`BytesN<32>`, `BytesN<64>`) | unit specs for `vrf`, `prng`, `commitment` |
| Smoke | ops | Oracle health endpoint | manual / `tier-2-scheduled` |

**When to add tests**

| Change | Required | Suggested test |
|--------|----------|----------------|
| Randomness (VRF/PRNG) | Unit + property where invariants exist | `vrf.service.spec.ts`, `prng.service.spec.ts`; fast-check for listener edge cases |
| Event listener / queue | Unit (+ property) | `event-listener.service.spec.ts` |
| Tx submitter / cost | Unit | `cost-estimator.service.spec.ts` (tx-submitter integration tests planned) |
| Stellar subscriber | Unit with mocked Horizon | `stellar-subscriber.service.spec.ts` |
| Live contract submit | Integration (future) | testnet job — not in default CI |

**Config:** `oracle/jest.config.js` (rootDir `.`, matches all `*.spec.ts`).

---

### SDK (`sdk/`)

**Stack:** NestJS library, Jest, typed Soroban bindings.

| Test type | Owner | Where to add | Command |
|-----------|-------|--------------|---------|
| Unit | sdk | `sdk/src/**/*.spec.ts` | `pnpm test` |
| Contract compatibility | sdk | `sdk/src/contract/*.spec.ts`, module specs using `ContractFn` | `pnpm test` |
| Integration (mocked RPC) | sdk | `sdk/src/test/rpc-integration.spec.ts` | `pnpm test` |
| Integration (testnet) | sdk (planned) | Future under `sdk/src/test/` against testnet | — |
| Smoke | sdk | Example scripts compile/run | `pnpm run examples:check` |

**When to add tests**

| Change | Required | Suggested test |
|--------|----------|----------------|
| New `ContractFn` / binding change | Contract compat unit | Update `contract/bindings.ts` + `contract.service.spec.ts`, `lifecycle.spec.ts` |
| Wallet adapter | Unit | `wallet/*.adapter.spec.ts` |
| Raffle / ticket / admin module | Unit | `modules/*/*.service.spec.ts` |
| Transaction lifecycle | Unit | `lifecycle.spec.ts` (simulate → sign → submit → poll) |
| Fee estimation | Unit | `fee-estimator.service.spec.ts` |
| Public API export | Unit + `examples:check` | ensure examples still typecheck |

**Config:** Jest inline in `sdk/package.json`; bindings in `sdk/src/contract/bindings.ts`.

---

## Risk levels

Use risk to decide how much testing is required before merge.

| Risk | Examples | Minimum bar |
|------|----------|-------------|
| **Low** | Docs, copy, CSS, logging | Unit optional; `tier-0-pr` build if types touched |
| **Medium** | Single-package feature, refactors with existing coverage | `tier-0-pr` unit + build in that package |
| **High** | Auth, payments, randomness, ingestion, contract bindings | `tier-0-pr` unit + `tier-1-merge` E2E/integration where available |
| **Critical** | Cross-package API, schema migration, contract interface | All touched packages `tier-0-pr` + `tier-1-merge`; root `npm run build`; `tier-2-scheduled` smoke |

---

## CI tiers

Workflows should name jobs or job summaries with these tier IDs so logs and branch protection rules stay aligned.

### Tier 0 — `tier-0-pr` (fast PR checks)

**Goal:** Feedback in ~5–10 minutes. Run on every pull request (path-filtered).

| Check | Packages | Command |
|-------|----------|---------|
| Lint | all with `lint` script | `pnpm run lint` or `npm run lint` in package dir |
| Build | changed packages | `pnpm run build` / `npm run build` |
| Unit tests | changed packages | see commands in ownership sections |

**Path filters (recommended)**

| Paths changed | Run |
|---------------|-----|
| `client/**` | client lint, build, `npm run test` |
| `backend/**` | backend lint, build, `pnpm test -- --ci` |
| `indexer/**` | indexer lint, build, `pnpm test` |
| `oracle/**` | oracle lint, build, `pnpm test` |
| `sdk/**` | sdk lint, build, `pnpm test` |
| `docs/testing/**` only | no code CI (docs-only) |
| Multiple packages | each touched package Tier 0 + root build if shared types/contracts |

**Implemented today:** `backend.yml` → `build-and-test` job covers backend **partial** `tier-0-pr` (build + unit test only; lint is not run in CI yet). Other packages are documented here for future workflow expansion.

---

### Tier 1 — `tier-1-merge` (extended checks)

**Goal:** Catch cross-layer regressions before or immediately after merge to `main` / `master`.

**Trigger:** merge to default branch, `workflow_dispatch`, or PR label `full-ci`.

| Check | Package | Command |
|-------|---------|---------|
| Backend E2E | backend | `pnpm run test:e2e` |
| Client E2E | client | `npm run test:e2e` |
| SDK examples | sdk | `pnpm run examples:check` |
| Root build | monorepo | `npm run build` (from repo root) |

**Not yet in CI:** client, sdk, indexer, oracle workflows. Add jobs referencing `tier-1-merge` when enabling them.

---

### Tier 2 — `tier-2-scheduled` (slow / infra-heavy)

**Goal:** Nightly or weekly signal; does not block most PRs.

**Trigger:** `schedule` cron (e.g. `0 3 * * *`) or manual dispatch.

| Check | Package | Command | Requires |
|-------|---------|---------|----------|
| Indexer integration | indexer | `pnpm run test:integration` | Docker |
| Indexer coverage | indexer | `pnpm run test:cov` | — |
| Full monorepo build | root | `npm run build` | — |
| All unit suites | all packages | per-package `test` | — |
| Staging smoke | ops | HTTP GET `/health` on backend, indexer, oracle | deployed env |
| Contract testnet (future) | sdk, oracle | TBD testnet integration jobs | testnet keys |

**Property tests** (oracle fast-check) run as part of oracle unit tests but are counted in Tier 2 when splitting jobs for speed (optional `jest --testPathPattern=event-listener`).

---

## Contributor decision tree

```
Changed code in one package?
├─ Yes → Run that package's Tier 0 commands (lint, build, test)
│        High/Critical risk? → Also run Tier 1 commands for that package
└─ No (cross-package) → Tier 0 in EACH touched package + npm run build at root

Touching Soroban bindings or contract methods?
└─ sdk contract specs + any consumer unit tests (backend indexer event parser fixtures)

Touching DB schema or migrations (indexer)?
└─ Add/update integration spec under indexer/src/test/integration/

Touching randomness or listener (oracle)?
└─ Unit + property tests; document manual testnet verification until integration exists
```

---

## Verification commands (local)

From the repository root (`tikka/`):

```bash
# ── Tier 0 (per package) ──────────────────────────────────────────────
cd client   && npm run lint && npm run build && npm run test
cd backend  && pnpm run lint && pnpm run build && pnpm test -- --ci
cd indexer  && pnpm run lint && pnpm run build && pnpm test
cd oracle   && pnpm run lint && pnpm run build && pnpm test
cd sdk      && pnpm run lint && pnpm run build && pnpm test

# ── Tier 1 ────────────────────────────────────────────────────────────
cd backend  && pnpm run test:e2e
cd client   && npm run test:e2e
cd sdk      && pnpm run examples:check
npm run build   # root — all five packages

# ── Tier 2 (Docker required for indexer integration) ──────────────────
cd indexer  && pnpm run test:integration
cd indexer  && pnpm run test:cov
```

**Package managers:** `client` uses npm; `backend`, `indexer`, `oracle`, and `sdk` use pnpm (`pnpm-lock.yaml` in each).

**Client install note:** If `npm install` fails on peer dependency conflicts, use `npm install --legacy-peer-deps` before running tests.

---

## Mapping to GitHub Actions

| Workflow | Tier | What runs |
|----------|------|-----------|
| `.github/workflows/backend.yml` → `build-and-test` | `tier-0-pr` | backend build + unit test |
| `.github/workflows/docs.yml` | — | SDK TypeDoc build only (not a test tier) |
| *Future* client workflow | `tier-0-pr` | lint, build, vitest |
| *Future* merge workflow | `tier-1-merge` | backend e2e, client playwright, root build |
| *Future* nightly workflow | `tier-2-scheduled` | indexer integration, full matrix |

When adding workflows, include in the job name or `env`:

```yaml
env:
  TIKKA_TEST_TIER: tier-0-pr   # or tier-1-merge, tier-2-scheduled
```

---

## Related documentation

| Doc | Notes |
|-----|-------|
| [../ARCHITECTURE.md](../ARCHITECTURE.md) | Ecosystem layout; aspirational CI pipeline |
| [../../TESTING_GUIDE.md](../../TESTING_GUIDE.md) | Manual QA for notification features |
| Package READMEs | Backend e2e, oracle unit coverage, client playwright |

---

## Out of scope (this repo)

- **Soroban contract tests** — `tikka-contracts` repo (`cargo test`, Soroban harness).
- **Load / performance testing** — not standardized yet.
- **Client `test:integration` script** — documented in `client/README.md` but not implemented; use unit + E2E instead.
