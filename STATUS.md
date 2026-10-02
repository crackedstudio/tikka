# STATUS.md — Tikka repository at a glance

> **Purpose:** one all-encompassing snapshot of the current state of this repository so that
> contributors (human or agent) can understand where the project stands **before** they start
> working, and keep this file accurate **after** they finish.
>
> **Scope:** every workspace, quality gate, CI workflow, environment, documentation entry point,
> and known gap in the `tikka` monorepo.

**Last updated:** 2026-09-29 · **Baseline commit:** `b220217` (`Fix/oracle 1612 1615 submitter logging health (#1712)`) · **Default branch:** `master`

---

## How to use this file (read this first)

**Before you start work**

1. Read §2 (repo map) and §3 (per-package state) to find the package you will touch.
2. Read §4 (quality gates) so you know which checks your change must satisfy.
3. Read §9 (known gaps) to avoid rediscovering a known problem.
4. Follow §10 (working protocol) for the local command sequence.

**After you finish work**

Update the parts of this file your change invalidated, at minimum:

- the affected row(s) in §3 (state, test counts, notable behaviour changes),
- §4 if you added/removed/renamed a CI check or changed a coverage gate,
- §7 if you touched deployment/environment configuration,
- §9 if you closed or introduced a known gap,
- append a one-line entry to §11 (status change log), and bump **Last updated** / **Baseline commit** at the top.

> Do not treat the volatile numbers below (test counts, CI conclusions) as permanently true —
> they are a snapshot. Re-verify them with the commands in §10 before relying on them.

---

## 1. What this repository is (60-second orientation)

**Tikka** is a decentralised raffle platform on **Stellar**. This repository is the _off-chain
ecosystem_: frontend, SDK, backend, indexer and oracle. The Soroban smart contracts (Rust) live in
a **separate repository** and are not present here (integration boundary documented in
[`docs/contracts/INTEGRATION_BOUNDARY.md`](./docs/contracts/INTEGRATION_BOUNDARY.md)).

Data flow in one line: **Chain events → Indexer → Backend API → Client**, with the **Oracle**
submitting randomness draws back to the chain and the **Client** writing transactions through the
**SDK**.

Start with [`README.md`](./README.md) for local setup, then
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full specification.

---

## 2. Repository map

pnpm workspaces + Turborepo monorepo. Root `package.json` declares the workspaces
(`client`, `sdk`, `backend`, `indexer`, `oracle`); `pnpm-workspace.yaml` is the workspace root
config; `turbo.json` defines the task graph (`build`, `lint`, `test`, `typecheck`, `docs`).

| Path                                           | Package name    | Role                                                                       | Stack                                                        |
| ---------------------------------------------- | --------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [`client/`](./client/)                         | `tikka`         | Consumer web app                                                           | React 19, Vite, TypeScript, Vitest, Playwright               |
| [`sdk/`](./sdk/)                               | `@tikka/sdk`    | Soroban tx build/simulate/sign/submit library                              | TypeScript, Nest build tooling, Jest, api-extractor, TypeDoc |
| [`backend/`](./backend/)                       | `tikka-backend` | Auth (SIWS), metadata, indexer merge, notifications, OpenAPI               | NestJS, Fastify, Supabase, TypeORM, Jest                     |
| [`indexer/`](./indexer/)                       | `tikka-indexer` | Horizon → decode → Postgres (+ Redis cache), DLQ, snapshots                | NestJS, TypeORM, Jest                                        |
| [`oracle/`](./oracle/)                         | `tikka-oracle`  | Draw-request listener, VRF/PRNG computation, tx submission                 | NestJS, Jest                                                 |
| [`packages/types/`](./packages/types/)         | `@tikka/types`  | Shared domain types (raffle, ticket, user, contract, events)               | TypeScript                                                   |
| [`db/`](./db/)                                 | —               | Baseline schema + migration policy (`db/migrations/`, `db/OPERATIONAL.md`) | SQL                                                          |
| [`k8s/`](./k8s/)                               | —               | Base Kubernetes manifests (deployment, service, HPA, PDB, kustomization)   | YAML                                                         |
| [`redis/`](./redis/), [`storage/`](./storage/) | —               | Operational notes for shared infra (`OPERATIONAL.md`)                      | Markdown                                                     |
| [`scripts/`](./scripts/)                       | —               | Repo-level checks: dependency rules, dashboard metrics, schema drift       | Node/TS                                                      |
| [`docs/`](./docs/)                             | —               | All cross-cutting documentation (see §6)                                   | Markdown                                                     |
| [`.changeset/`](./.changeset/)                 | —               | Changesets used for SDK versioning + changelog generation                  | Markdown                                                     |

Module boundaries are enforced by `dependency-cruiser` (config in root `package.json`,
run via `pnpm run check:boundaries` or `backend`'s `pnpm run boundaries`): `client` may not import
`backend`/`indexer`, `indexer` may not import `backend`, `sdk` may not import any app package.
See [`docs/contributing/MODULE_BOUNDARIES.md`](./docs/contributing/MODULE_BOUNDARIES.md).

---

## 3. Current state by package

Snapshot at baseline commit `b220217`. "Test files" counts `*.spec.*` / `*.test.*` files excluding
`node_modules`. All five app packages build on `strict: true` via `tsconfig.base.json`
(`client` opts in through `tsconfig.app.json`).

| Package          | Tests (files) | Test runner                               | Lint           | Typecheck           | Coverage gate (CI ratchet) | State                                                                                                                                         |
| ---------------- | ------------- | ----------------------------------------- | -------------- | ------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `client`         | 63            | Vitest (+ Playwright e2e, Lighthouse)     | ✅ `pnpm lint` | ✅ `pnpm typecheck` | 80% lines                  | Active — highest-churn UI package; generated API types (`src/types/api.generated.ts`) must stay in sync with `backend/openapi.json`           |
| `sdk`            | 39            | Jest / ts-jest                            | ✅             | ✅                  | 80% lines                  | Active — published package; changes to `sdk/src/**` **require a changeset**; API surface gated by api-extractor; bundle size budgets enforced |
| `backend`        | 59            | Jest (mocked unit + integration + e2e)    | ✅             | ✅ (`build`)        | 70% lines                  | Active — OpenAPI spec committed and must be regenerated (`pnpm run generate:openapi`) when routes change                                      |
| `indexer`        | 64            | Jest (network tests excluded in CI)       | ✅             | ✅                  | 50% lines                  | Active — TypeORM migrations are versioned under `indexer/src/database/migrations/`; env schema validated at startup                           |
| `oracle`         | 55            | Jest (unit + e2e: mocked/standalone/full) | ✅             | ✅                  | 70% lines                  | Active — recent work: hash-chained audit log, Byzantine multi-oracle tests, stuck-draw alerting                                               |
| `packages/types` | 0             | — (`tsc` build only)                      | —              | ✅                  | —                          | Consumed directly by `client` via tsconfig `paths` (no `dist` needed)                                                                         |

**Total: 280 test files across the five app packages.**

Coverage thresholds are enforced by the coverage ratchet in `.github/workflows/ci.yml`
(`ci-summary` job): client 80 · sdk 80 · backend 70 · indexer 50 · oracle 70. The policy is
"raise when coverage rises; lowering requires a docs/testing update" — see
[`docs/testing/COVERAGE_POLICY.md`](./docs/testing/COVERAGE_POLICY.md).

### Notable in-flight / recent workstreams

- **Stellar Wave** (label `Stellar Wave`): full-ecosystem refactor initiative — issue templates,
  quality checklists and roadmap are organised around it (see §8).
- Oracle reliability & audit hardening (stuck-draw alerts, hash-chained audit log, multi-oracle
  Byzantine tests, submitter logging/health) — the last several merges on `master`.
- Workspace standardisation and tech-debt remediation (module boundaries, shared types package,
  `ts-jest` diagnostics re-enabled, TypeORM version reconciled between backend and indexer).

---

## 4. Quality gates & CI status

### Workflows registered in the repository

| Workflow file             | Name                                                                                                                           | Trigger                                                       | State                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------- |
| `ci.yml`                  | CI                                                                                                                             | PR + push to `master`                                         | **disabled manually**                  |
| `e2e.yml`                 | Playwright Tests                                                                                                               | PR + push to `master`                                         | **disabled manually**                  |
| `deploy-backend.yml`      | Deploy Backend                                                                                                                 | after `CI` succeeds on push to `master`                       | active                                 |
| `docs.yml`                | Deploy SDK Docs                                                                                                                | push to `master` + tags                                       | active (currently failing — see below) |
| `release.yml`             | Release                                                                                                                        | push to `master`                                              | active (currently failing — see below) |
| `indexer-integration.yml` | Indexer Integration Tests                                                                                                      | path-filtered PRs on indexer ingestion/DB + nightly 03:00 UTC | active (currently failing — see below) |
| `performance-test.yml`    | Performance & Load Testing                                                                                                     | nightly 02:00 UTC + manual                                    | active (currently failing — see below) |
| `testnet-integration.yml` | SDK Testnet Integration (Nightly)                                                                                              | nightly 03:00 UTC + manual                                    | active (currently failing — see below) |
| `supabase-backup.yml`     | Supabase Database Backup                                                                                                       | nightly 02:00 UTC + manual                                    | active (currently failing — see below) |
| —                         | CodeQL, SDK Stellar Compatibility Matrix, Workflow Validation (actionlint + yamllint), Copilot code review, Dependabot Updates | various                                                       | active                                 |

**Observed baseline (2026-09-29):** the two PR-gating workflows (`CI`, `Playwright Tests`) are
**disabled manually**, so pull requests are **not** currently gated by the turbo lint/test/build
matrix. The nightly/scheduled workflows (`SDK Testnet Integration`, `Indexer Integration Tests`,
`Performance & Load Testing`, `supabase-backup`, `Release`, `Deploy SDK Docs`) were **failing** on
`master` at the time of writing, while `CodeQL` and `SDK Stellar Compatibility Matrix` were green.
Treat scheduled-workflow failures as the current norm, verify before assuming a regression, and
re-check live status with `gh run list --repo crackedstudio/tikka`.

### What `ci.yml` gates when re-enabled

The disabled `CI` workflow is still the definition of "green" for this repo. It runs:

1. **Path detection** (`dorny/paths-filter`) — docs-only changes skip the turbo job entirely.
2. **Turbo job** — WCAG colour-contrast check, generated API types freshness, `pnpm lint`,
   client unit tests with 80% coverage thresholds, `pnpm build`, OpenAPI generation + freshness +
   validation, accessibility e2e (non-blocking).
3. **Per-package jobs** — `sdk` (lint, typecheck, test, build, read/light entry points,
   api-extractor × 4, bundle-size budgets, TypeDoc), `backend` (lint, test w/ 80% thresholds,
   OpenAPI validation, dependency-cruiser boundaries, build), `indexer` (lint, typecheck, test,
   build), `oracle` (lint, test w/ 80% thresholds, build).
4. **Cross-cutting gates** — verify clean working tree after build+test, Docker Compose smoke test
   (profile `full` + health endpoints on 3001/3002/3003), observability dashboard-metric
   validation, TruffleHog secret scanning, coverage summary + ratchet, Lighthouse performance
   budgets, commitlint, Prettier format check, SDK changeset check (PRs touching `sdk/src/`).

### Local equivalents (run these — they are the real gate today)

```bash
pnpm install --frozen-lockfile   # Node 22 + pnpm 9.15.9 (see §5)
pnpm run lint                    # turbo lint (all packages)
pnpm run typecheck               # turbo typecheck
pnpm run test                    # turbo test (dependsOn ^build)
pnpm run build                   # turbo build
pnpm exec prettier --check .     # formatting (CI "format" job)
pnpm exec commitlint --from <base> --to HEAD   # commit messages
pnpm run check:boundaries        # dependency-cruiser rules
pnpm run check:observability     # dashboard queries vs METRICS_MAP.md
```

Git hooks (`.husky/`): `pre-commit` → lint-staged (prettier + per-package lint/typecheck),
`commit-msg` → commitlint, `pre-push` → `pnpm lint && pnpm test && pnpm typecheck`.

Commit messages must follow Conventional Commits with a **mandatory scope** from:
`client | sdk | backend | indexer | oracle | repo | docs` (see `commitlint.config.js`).

---

## 5. Toolchain & version pins

| Tool                       | Version                                                                                                    | Source of truth                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Node.js                    | **22**                                                                                                     | `.nvmrc` (mirrored by `.node-version`), read by CI and Docker base images |
| pnpm                       | **9.15.9**                                                                                                 | `packageManager` in root `package.json`; CI installs this exact version   |
| Turborepo                  | 2.5.4                                                                                                      | root `devDependencies`                                                    |
| TypeScript                 | ^5 (packages)                                                                                              | `tsconfig.base.json` → `strict: true`, decorators for NestJS              |
| Package manager strictness | `.npmrc` currently sets `engine-strict=false` (comment describes intent to fail on Node mismatch — see §9) |

Other repo-level tooling: Husky 9 + lint-staged, commitlint (conventional), Prettier
(`.prettierrc`: 100 cols, single quotes, trailing commas), changesets, dependency-cruiser.

---

## 6. Documentation map (where to find what)

Entry points: [`README.md`](./README.md) (setup) · [`docs/README.md`](./docs/README.md) (index) ·
[`CONTRIBUTING.md`](./CONTRIBUTING.md) (per-workspace quickstarts) · this file (state).

| Need                                                                                     | Go to                                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| System design, APIs, data flows                                                          | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)                                                                                                                 |
| Raffle lifecycle walkthrough                                                             | [`docs/RAFFLE_LIFECYCLE.md`](./docs/RAFFLE_LIFECYCLE.md)                                                                                                         |
| Randomness scheme + how to verify a draw                                                 | [`docs/RANDOMNESS_SCHEME.md`](./docs/RANDOMNESS_SCHEME.md)                                                                                                       |
| Wallet adapters (Freighter, Albedo, Rabet, xBull, LOBSTR, Mock)                          | [`docs/WALLET_ADAPTERS.md`](./docs/WALLET_ADAPTERS.md)                                                                                                           |
| Release policy, versioning, changelog procedure                                          | [`docs/RELEASE.md`](./docs/RELEASE.md) + [`CHANGELOG.md`](./CHANGELOG.md)                                                                                        |
| Deployment paths per service                                                             | [`docs/DEPLOYMENTS.md`](./docs/DEPLOYMENTS.md), [`docs/k8s-deployment.md`](./docs/k8s-deployment.md)                                                             |
| Operational checklist / incident readiness                                               | [`docs/OPERATIONAL_CHECKLIST.md`](./docs/OPERATIONAL_CHECKLIST.md)                                                                                               |
| Operational runbooks (8: oracle rescue, stuck draw, indexer lag, reorg rollback, DLQ, …) | [`docs/runbooks/`](./docs/runbooks/)                                                                                                                             |
| Architecture decision records                                                            | [`docs/adr/`](./docs/adr/)                                                                                                                                       |
| Module ownership & boundaries                                                            | [`docs/contributing/MODULE_BOUNDARIES.md`](./docs/contributing/MODULE_BOUNDARIES.md)                                                                             |
| Stellar Wave implementation standards                                                    | [`docs/quality/STELLAR_WAVE_CHECKLIST.md`](./docs/quality/STELLAR_WAVE_CHECKLIST.md), [`docs/quality/CONTRIBUTOR_GUIDE.md`](./docs/quality/CONTRIBUTOR_GUIDE.md) |
| Coverage policy                                                                          | [`docs/testing/COVERAGE_POLICY.md`](./docs/testing/COVERAGE_POLICY.md)                                                                                           |
| DB schema, migrations, entity ownership                                                  | [`docs/database/`](./docs/database/), [`db/OPERATIONAL.md`](./db/OPERATIONAL.md)                                                                                 |
| Observability (dashboards, metrics map, alerts)                                          | [`docs/observability/`](./docs/observability/)                                                                                                                   |
| Security threat model                                                                    | [`docs/security/threat-model.md`](./docs/security/threat-model.md), [`SECURITY.md`](./SECURITY.md)                                                               |
| Performance / bundle size / load tests                                                   | [`docs/performance/`](./docs/performance/)                                                                                                                       |
| Contract integration & upgrade process                                                   | [`docs/contracts/`](./docs/contracts/)                                                                                                                           |
| Environment variable reference per package                                               | [`docs/env/`](./docs/env/)                                                                                                                                       |
| Structural roadmap & milestones                                                          | [`docs/roadmap/ROADMAP_STRUCTURAL.md`](./docs/roadmap/ROADMAP_STRUCTURAL.md)                                                                                     |
| Historical / superseded notes                                                            | [`docs/archive/`](./docs/archive/)                                                                                                                               |
| Per-package entry point                                                                  | `client/README.md`, `sdk/README.md`, `backend/README.md`, `indexer/README.md`, `oracle/README.md`                                                                |

---

## 7. Environments & deployment status

**Local:** `docker compose` profiles — `deps` (Postgres + Redis), `backend` (:3001),
`indexer` (:3002), `oracle` (:3003), `full` (deps + all services), `client` (full + Vite :5173).
Env files: copy `.env.example` → `.env`, plus per-package `*.env.example` → `.env.local`
(see [`docs/env/`](./docs/env/)).

**Deployment paths (authoritative table: [`docs/DEPLOYMENTS.md`](./docs/DEPLOYMENTS.md))**

| Service  | Path                                | Automation                                                                                                                                     |
| -------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend  | Railway deploy hook                 | `deploy-backend.yml`, only after `CI` succeeds on push to `master` (currently gated by a disabled workflow → **no automated deploys from CI**) |
| Client   | Vercel Git integration              | `client/vercel.json`; no GitHub Actions job                                                                                                    |
| Indexer  | Kubernetes overlay (`indexer/k8s/`) | manual `kubectl apply` — see [`docs/k8s-deployment.md`](./docs/k8s-deployment.md)                                                              |
| Oracle   | Kubernetes overlay (`oracle/k8s/`)  | manual `kubectl apply`                                                                                                                         |
| SDK docs | GitHub Pages                        | `docs.yml` (TypeDoc → crackedstudio.github.io/tikka)                                                                                           |
| Database | Supabase                            | nightly `pg_dump` → R2 (`supabase-backup.yml`, currently failing); migrations are timestamped with rollback procedure                          |

---

## 8. Workstreams & project organisation

- **Issue labels:** `area:backend|client|indexer|oracle|sdk|repo`, plus `bug`, `enhancement`,
  `documentation`, `testing`, `security`, `performance`, `refactor`, `ci`, and `Stellar Wave`
  (full-ecosystem refactor initiative).
- **Issue templates:** package-scoped (`backend.md`, `client.md`, `indexer.md`, `oracle.md`,
  `sdk.md`, `cross-package.md`, `docs.md`, `security.md`) + `bug_report.yml` /
  `feature_request.yml`. PR template: `.github/pull_request_template.md`. CODEOWNERS present.
- **Roadmap:** [`docs/roadmap/ROADMAP_STRUCTURAL.md`](./docs/roadmap/ROADMAP_STRUCTURAL.md) groups
  ~120 structural issues into milestones: **Foundation, Reliability, Observability, Security,
  Developer Experience**, sequenced sdk → indexer → oracle → backend → client → infra/docs.
  **Status: Draft** — GitHub milestones are not yet created from it.
- **Open work volume:** 100+ open issues and 100+ open pull requests (measured with a capped
  query of 100 on 2026-09-29; treat as "≥100", re-query for exact numbers).
- **Branch naming convention in active use:** `fix/<issue>-…`, `feat/<area>…`, package-scoped
  branches; PRs are merged to `master`.

---

## 9. Known gaps & risks

Verified on 2026-09-29 against `master` (`b220217`). Update this list when you close or add a gap.

1. **PR-gating CI is off.** `ci.yml` (CI) and `e2e.yml` (Playwright) are `disabled_manually`.
   Changes can merge without the lint/test/build matrix running. Re-enable or replace them before
   treating CI as a safety net.
2. **Scheduled workflows are red.** `SDK Testnet Integration (Nightly)`, `Indexer Integration
Tests` (scheduled run), `Performance & Load Testing`, `supabase-backup`, `Release` and
   `Deploy SDK Docs` were failing on `master`. Nightly failures need triage before they mask real
   regressions.
3. **`Release` failing blocks changelog automation.** Changesets-based changelog/versioning only
   produces output when `release.yml` succeeds on `master`.
4. **`docs/README.md` index drift:** it links `./RAFFLE_LIFECycle.md` (wrong casing) while the
   real file is `docs/RAFFLE_LIFECYCLE.md`; `README.md` links `./docs/RELEASEE.md` (typo) though
   the file is `docs/RELEASE.md`. Case-sensitive CI/CD environments break these links.
5. **Root scripts referenced by disabled CI are not all defined at the root.** `ci.yml` calls
   `pnpm run test:unit`, `generate:types`, `generate:openapi`, `validate:openapi` and
   `test:e2e` from the repo root, but those scripts live in package `package.json` files —
   re-enabling the workflow as-is would fail. Fix the workflow (or add root scripts) first.
6. **`verify-clean-tree` job** in `ci.yml` uses pnpm 8 / Node 20 while the repo pins pnpm 9.15.9 /
   Node 22 — a latent mismatch.
7. **`.npmrc` vs `CONTRIBUTING.md`:** docs say installs fail on Node mismatch, but
   `engine-strict` is currently `false`.
8. **`TYPESCRIPT_STRICT_MODE_MIGRATION.md`** at the repo root still reads "Phase 1: Assessment"
   with garbled status markers, while strict mode is already enabled repo-wide — the document is
   stale (candidate for `docs/archive/`).
9. **Indexer coverage gate is the lowest** (50% ratchet vs 80% for client/sdk) — deliberate, but
   it is the largest coverage debt.
10. **Docs-only changes skip the turbo job** in `ci.yml` by design (`dorny/paths-filter`); docs PRs
    still get Prettier, commitlint and TruffleHog checks only.
11. **External contract dependency:** contract ABI/instability blocks `sdk`/`indexer`/`oracle`
    work (called out in the roadmap as a top blocker).

---

## 10. Working protocol (local sequence for contributors/agents)

```bash
# 0. Environment
node --version        # must be 22 (nvm use / fnm use / mise use)
corepack enable && pnpm --version   # must be 9.15.9

# 1. Install + services
pnpm install --frozen-lockfile
cp .env.example .env  # + per-package env files (see README)
docker compose --profile deps up -d   # Postgres + Redis

# 2. Selective build/test (prefer package scope over whole repo)
pnpm run build --filter=<pkg>     # client | @tikka/sdk | tikka-backend | tikka-indexer | tikka-oracle
pnpm run test  --filter=<pkg>
pnpm run lint  --filter=<pkg>
pnpm run typecheck --filter=<pkg>

# 3. Repo-wide gate (what CI would run)
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build
pnpm exec prettier --check .

# 4. Package-specific extras when you touch those areas
#    client   : pnpm generate:types   (after backend/openapi.json changes)
#    backend  : pnpm generate:openapi && pnpm validate:openapi
#    sdk      : pnpm changeset        (REQUIRED for sdk/src/** changes)
#    indexer  : pnpm migration:run / migration:generate
#    oracle   : pnpm test:e2e:mocked, pnpm config:verify

# 5. Update STATUS.md (§11 + affected sections), then commit with a
#    conventional, scoped message:  docs(repo): …   /   docs(client): …
```

Full workspace quickstarts: [`CONTRIBUTING.md`](./CONTRIBUTING.md).
Quality checklist before opening a PR:
[`docs/quality/QUICK_REFERENCE.md`](./docs/quality/QUICK_REFERENCE.md).

---

## 11. Status change log

Append one line per change that affects this file's accuracy: `YYYY-MM-DD — <summary> — <commit/PR>`.

- 2026-09-29 — Initial all-encompassing STATUS.md created (issue #1752); snapshot of package
  state, quality gates, CI/workflow status, docs map, deployment paths and known gaps at `b220217`.
