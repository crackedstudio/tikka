# Contributing to Tikka

Welcome to the Tikka ecosystem — a decentralized raffle platform built on Stellar and Soroban. This guide is the single source of truth for setting up a local environment, understanding the codebase, and submitting high-quality pull requests.

**Table of contents**

1. [Prerequisites](#1-prerequisites)
2. [Understanding the ecosystem](#2-understanding-the-ecosystem)
3. [First-time setup](#3-first-time-setup)
4. [Running services](#4-running-services)
5. [Verifying your setup](#5-verifying-your-setup)
6. [Development workflows](#6-development-workflows)
7. [Code style](#7-code-style)
8. [Testing](#8-testing)
9. [Claiming an issue](#9-claiming-an-issue)
10. [Branching strategy](#10-branching-strategy)
11. [Commit format](#11-commit-format)
12. [Pull request process](#12-pull-request-process)
13. [Module boundaries](#13-module-boundaries)
14. [Changelog and versioning](#14-changelog-and-versioning)
15. [Troubleshooting](#15-troubleshooting)
16. [Reporting issues](#16-reporting-issues)

---

## 1. Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| Node.js | 20 LTS | [nodejs.org](https://nodejs.org) |
| pnpm | 9 | `npm install -g pnpm@9` |
| Docker Desktop | latest stable | [docker.com](https://www.docker.com/products/docker-desktop/) |
| Git | 2.30+ | [git-scm.com](https://git-scm.com) |

> **Why pnpm?** The `client` package uses pnpm. The NestJS packages (`backend`, `indexer`, `oracle`, `sdk`) use npm via the root `install:all` script. Both must be available.

Verify before continuing:

```bash
node --version     # v20.x.x or higher
pnpm --version     # 9.x.x
docker --version   # Docker version 24+ or later
docker compose version  # v2.x.x (not docker-compose v1)
```

---

## 2. Understanding the ecosystem

Read [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) before making changes. The short version:

| Package | Port | Role |
|---------|------|------|
| `client` | 5173 | React 19 consumer web app. Reads from `backend`, writes on-chain via `sdk`. |
| `sdk` | — | NestJS library (`@tikka/sdk`). Builds, signs, and submits Soroban transactions. |
| `backend` | 3001 | REST API — auth (SIWS), raffle metadata, notifications. Uses Supabase + indexer. |
| `indexer` | 3002 | Ingests Horizon events → decodes → PostgreSQL + Redis cache. |
| `oracle` | 3003 | Listens for draw requests, computes VRF/PRNG randomness, submits to contract. |
| Postgres | 5432 | Primary database for `indexer` (and `backend` via Supabase in production). |
| Redis | 6379 | Cache layer for `indexer`; job queue for `oracle`. |

Soroban smart contracts (Rust) live in a **separate repository** and are not part of this codebase. You interact with deployed contracts via the SDK.

For a detailed lifecycle of a raffle from creation through winner selection, see [docs/RAFFLE_LIFECYCLE.md](./docs/RAFFLE_LIFECYCLE.md).

---

## 3. First-time setup

### 3.1 Clone and copy environment files

```bash
git clone https://github.com/crackedstudio/tikka.git
cd tikka

# Root env
cp .env.example .env

# Package-level envs (gitignored, safe to edit)
cp backend/.env.example backend/.env.local
cp indexer/.env.example indexer/.env.local
cp oracle/.env.example oracle/.env.local
```

### 3.2 Fill in required secrets

The apps validate environment variables at startup and fail fast with clear error messages for missing required values.

**`backend/.env.local`** — minimum required:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Full URL of your Supabase project (`https://xyz.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (not the anon key) |
| `JWT_SECRET` | Minimum 32 characters; used to sign auth tokens |
| `VITE_FRONTEND_URL` | Frontend origin for CORS (e.g. `http://localhost:5173`) |
| `ADMIN_TOKEN` | Bearer token for `/admin/*` endpoints |

**`indexer/.env.local`** — minimum required:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/tikka_indexer` |
| `SOROBAN_RPC_URL` | Soroban RPC endpoint (e.g. `https://soroban-testnet.stellar.org`) |
| `TIKKA_CONTRACT_ID` | On-chain contract address for the raffle contract |

**`oracle/.env.local`** — see `oracle/.env.example` for all variables. For local development the minimum is:

| Variable | Description |
|----------|-------------|
| `SOROBAN_RPC_URL` | Same Soroban RPC as indexer |
| `RAFFLE_CONTRACT_ID` | Same contract address |
| `NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` for testnet |
| `ORACLE_SECRET_KEY` | Ed25519 secret key (`S...`) for signing randomness submissions |

> **Production key management:** The oracle supports AWS KMS and Google Cloud KMS. See `oracle/docs/KEY_MANAGEMENT.md`. For local dev, an env-var secret key is sufficient.

### 3.3 Start backing services

```bash
docker compose --profile deps up -d
```

This starts Postgres (port 5432) and Redis (port 6379) only. The NestJS services start outside Docker during development so you get hot-reload.

### 3.4 Install all package dependencies

```bash
npm run install:all
```

This runs `npm install` for `client`, `sdk`, `backend`, `indexer`, and `oracle` in sequence.

---

## 4. Running services

### Full stack in Docker (fastest start)

```bash
docker compose --profile full up --build
```

Starts: Postgres, Redis, backend (3001), indexer (3002), oracle (3003). Does **not** include the client.

```bash
docker compose --profile client up --build
```

Starts everything including the Vite dev server (5173).

### Individual services with Docker

```bash
docker compose --profile backend up --build   # deps + backend on :3001
docker compose --profile indexer up --build   # deps + indexer on :3002
docker compose --profile oracle  up --build   # deps + oracle  on :3003
```

### Individual services without Docker (hot-reload)

Best for active development on a single package:

```bash
# Backend
docker compose --profile deps up -d
cd backend && npm run start:dev

# Indexer
docker compose --profile deps up -d
cd indexer && npm run start:dev

# Oracle
docker compose --profile deps up -d
cd oracle && npm run start:dev
```

### Client (always runs locally)

```bash
docker compose --profile backend up -d    # backend must be running
cd client && pnpm install && pnpm dev     # http://localhost:5173
```

### Tear down

```bash
docker compose --profile full down -v    # stops containers and removes volumes
```

---

## 5. Verifying your setup

After starting services, confirm they are healthy before writing code.

### Backend

```bash
curl http://localhost:3001/health
# Expected: {"status":"ok","indexer":"ok","supabase":"ok","timestamp":"..."}
```

### Indexer

```bash
curl http://localhost:3002/health
# Expected: {"status":"ok","lag_ledgers":...,"db":"ok","redis":"ok"}
```

### Oracle

```bash
curl http://localhost:3003/health
# Expected: {"status":"healthy","timestamp":"...","pendingLagRequests":0}
```

### Client

Open `http://localhost:5173` in your browser. The homepage should load without console errors.

If any health check returns a non-`ok` status, inspect the service logs before continuing:

```bash
docker compose logs backend   # or indexer / oracle
```

---

## 6. Development workflows

### Working on the client only

```bash
docker compose --profile backend up -d
cd client && pnpm dev
```

The Vite dev server proxies API calls to the backend container at port 3001. No SDK build step is needed unless you are also modifying the SDK.

### Working on the SDK alongside the client

The `client` consumes `@tikka/sdk` from its local `node_modules`. To develop both at the same time, use npm's `link` mechanism:

```bash
# Build the SDK in watch mode
cd sdk && npm run build -- --watch

# In a separate terminal, link it into the client
cd client && npm link ../sdk
```

Alternatively, use the SDK's `dist/` output directly — the `npm link` approach picks up incremental builds automatically.

To regenerate the SDK API docs locally:

```bash
cd sdk && npm run docs       # outputs to sdk/docs/
cd sdk && npm run docs:watch  # rebuild on file change
```

### Working on the backend or indexer

Both services support hot-reload via NestJS:

```bash
cd backend && npm run start:dev   # watches src/**/*.ts
cd indexer && npm run start:dev
```

Database migrations for the indexer run automatically at startup via TypeORM (`migrationsRun: true`). You do not need to run them manually during development.

To create a new indexer migration after changing an entity:

```bash
cd indexer
npm run migration:generate -- src/database/migrations/YourMigrationName
npm run migration:run      # apply
npm run migration:revert   # rollback
```

### Working on the oracle

The oracle uses a Bull queue backed by Redis and processes randomness requests from Stellar Horizon events. For local testing you can use mocked contracts:

```bash
cd oracle && npm run test:e2e:mocked
```

For on-call or rescue operations, the CLI is available:

```bash
npm run oracle:rescue list-failed
npm run oracle:rescue re-enqueue <jobId> --operator <name> --reason <reason>
```

See `oracle/RESCUE_GUIDE.md` for the full rescue workflow.

---

## 7. Code style

### TypeScript

All packages use TypeScript in strict mode. Run the type-checker separately from the linter:

```bash
# Type-check without emitting output
cd client  && npx tsc --noEmit
cd sdk     && npx tsc --noEmit
cd backend && npx tsc --noEmit
cd indexer && npx tsc --noEmit
cd oracle  && npx tsc --noEmit
```

Type errors are blocking — a PR with type errors will not be merged.

### ESLint

Each package has its own ESLint configuration. Run lint from the package directory:

```bash
cd <package> && npm run lint   # backend / indexer / oracle / sdk
cd client    && pnpm lint
```

There is no global lint command at the repo root. Run lint for every package you touched.

### General rules

- No `any` unless absolutely unavoidable and explicitly suppressed with a comment explaining why.
- Keep functions small and focused. Prefer composition over inheritance.
- Do not import across package boundaries — `client` must go through `@tikka/sdk` for contract interactions, not bypass it.
- Follow the NestJS module pattern for backend, indexer, and oracle (controllers → services → repositories).
- For UI components in `client`, keep business logic out of JSX — put it in hooks or service files under `src/`.

---

## 8. Testing

Run these checks for every package you changed before opening a PR. All must pass.

### client

```bash
cd client
pnpm lint
pnpm test          # Vitest unit tests
pnpm test:e2e      # Playwright end-to-end (requires backend running on :3001)
```

Run Playwright in headed mode to debug failures:

```bash
pnpm test:e2e:headed
```

### sdk

```bash
cd sdk
npm run lint
npm run test             # Jest unit tests
npm run examples:check   # type-check all examples (no network required)
```

### backend

```bash
cd backend
npm run lint
npm run test       # Jest unit tests
npm run test:e2e   # integration tests (requires Postgres and Redis running)
```

### indexer

```bash
cd indexer
npm run lint
npm run test              # Jest unit tests (excludes integration folder)
npm run test:integration  # integration tests via Testcontainers (spins up a real Postgres)
npm run test:cov          # unit tests with coverage report
```

> `test:integration` downloads a Postgres Docker image via Testcontainers on first run — this can take a minute.

### oracle

```bash
cd oracle
npm run lint
npm run test              # Jest unit tests
npm run test:e2e          # all e2e suites
npm run test:e2e:mocked   # mocked oracle flow only (no live Stellar network required)
```

### Type-check everything

```bash
for pkg in client sdk backend indexer oracle; do
  echo "--- $pkg ---"
  (cd $pkg && npx tsc --noEmit)
done
```

---

## 9. Claiming an issue

1. Browse [GitHub Issues](https://github.com/crackedstudio/tikka/issues) for open, unassigned issues.
2. Look for the `good first issue` label if you are new to the codebase.
3. Leave a comment: _"I'd like to work on this."_
4. Wait for a maintainer to assign it to you — do not start coding before assignment.
5. If no response within 48 hours, tag a maintainer in your comment.
6. Only one issue per contributor at a time while the PR for a previous issue is still open.

This prevents duplicate effort and ensures issues reflect the true state of in-progress work.

---

## 10. Branching strategy

Branch from `master`. Use one of the following prefixes:

| Prefix | When to use |
|--------|-------------|
| `feat/` | New functionality |
| `fix/` | Bug fixes |
| `refactor/` | Code restructuring with no behaviour change |
| `docs/` | Documentation only |
| `chore/` | Build, tooling, CI, or dependency updates |
| `test/` | Adding or improving tests with no production code change |

```bash
git checkout master
git pull origin master
git checkout -b feat/your-descriptive-name
```

Keep branch names lowercase and hyphen-separated. Include the issue number when applicable: `fix/762-cache-key-collision`.

All pull requests target `master`. There are no long-lived feature branches.

---

## 11. Commit format

Use [Conventional Commits](https://www.conventionalcommits.org/) with the affected package as the scope:

```
<type>(<scope>): <short description>

[optional body — explain WHY, not what]

[optional footer — BREAKING CHANGE: or Closes #issue]
```

**Valid types:** `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `perf`

**Valid scopes:** `client`, `sdk`, `backend`, `indexer`, `oracle`, `docs`, `infra`

**Examples:**

```
feat(client): add ticket purchase confirmation modal
fix(backend): return 404 instead of 500 for unknown raffle ids
refactor(sdk): simplify transaction retry backoff logic
docs(indexer): document Redis TTL strategy per data type
chore(infra): upgrade docker base images to node 20-alpine
test(oracle): add integration test for VRF high-stakes path
perf(indexer): add composite index on raffle_events (raffle_id, created_at)
```

Rules:
- Subject line: imperative mood, under 72 characters, no trailing period.
- Body: explain the _why_ when it is not obvious from the code.
- Breaking changes: add `BREAKING CHANGE:` in the footer with migration instructions.
- One logical change per commit. Squash fixup commits before opening a PR.

---

## 12. Pull request process

### Before opening

- [ ] Branch name follows the naming convention.
- [ ] All commits follow Conventional Commits format.
- [ ] `npm run lint` (or `pnpm lint`) passes for every changed package.
- [ ] `npx tsc --noEmit` passes for every changed package.
- [ ] Unit tests pass for every changed package.
- [ ] Integration or e2e tests pass if your change affects contract interaction, database queries, or HTTP endpoints.
- [ ] `CHANGELOG.md` has a new entry under `[Unreleased]` summarising the change (see [Changelog and versioning](#14-changelog-and-versioning)).
- [ ] Cross-package changes follow the guidance in [docs/contributing/MODULE_BOUNDARIES.md](./docs/contributing/MODULE_BOUNDARIES.md).

### PR description template

```
## Summary
- What this PR does (1–3 bullets)
- Why it is needed (link to issue)

## Changes
- Package(s) affected
- Key files changed

## Testing done
- [ ] Unit tests pass
- [ ] Integration tests pass (if applicable)
- [ ] Manually tested flow: <describe steps>

## Screenshots / recordings (UI changes only)

Closes #<issue-number>
```

### Review process

- At least one maintainer approval is required before merge.
- Reviewers focus on correctness, module boundary adherence, test coverage, and type safety.
- Address all review comments before requesting re-review.
- Avoid force-pushing after a PR is under review — add new commits instead so reviewers can see what changed.
- PRs that have been open without activity for 14 days may be closed and the issue reassigned.

### After merge

- The issue is closed automatically if the PR description contains `Closes #<number>`.
- Your change will appear in the next release entry in `CHANGELOG.md`.

---

## 13. Module boundaries

Each package owns a specific domain. Violating these boundaries makes the codebase harder to maintain and review.

| Package | Owns |
|---------|------|
| `client` | UI, pages, forms, charts, browser state, wallet UX |
| `sdk` | Contract bindings, tx building/simulation/submission, wallet adapters |
| `backend` | REST API, auth (SIWS), metadata, notifications, business logic |
| `indexer` | Horizon event ingestion, Postgres writes, Redis cache management |
| `oracle` | Randomness computation (VRF/PRNG), contract callback submission |
| `docs` | Architecture docs, onboarding guides, contributor guidance |
| `infra` | Docker, CI/CD, deployment config, GitHub Actions |

**If you are unsure where a feature belongs**, open an issue and tag package maintainers before writing code.

For the full ownership matrix, cross-package review checklist, and common multi-package scenarios, see [docs/contributing/MODULE_BOUNDARIES.md](./docs/contributing/MODULE_BOUNDARIES.md).

---

## 14. Changelog and versioning

Every PR that changes production code must add a `CHANGELOG.md` entry.

Add your change under the `[Unreleased]` section at the top of [CHANGELOG.md](./CHANGELOG.md):

```markdown
## [Unreleased]

### Added
- feat(client): ticket purchase confirmation modal (#123)

### Fixed
- fix(backend): return 404 for unknown raffle ids (#124)
```

Use one of these subsections: `Added`, `Changed`, `Fixed`, `Deprecated`, `Removed`, `Security`.

**Versioning scheme:**

| Package | Scheme | Example |
|---------|--------|---------|
| `sdk` | Semantic Versioning (`MAJOR.MINOR.PATCH`) | `0.3.1` |
| `client`, `backend`, `indexer`, `oracle` | Calendar Versioning (`YYYY.MM.PATCH`) | `2026.06.0` |
| Database migrations | Timestamp prefix | `1748589373000-AddArchiveCheckpoints.ts` |

You do not need to bump version numbers in `package.json` as part of a regular PR — that is done by maintainers at release time. See [docs/RELEASE.md](./docs/RELEASE.md) for the full release procedure.

---

## 15. Troubleshooting

### Port already in use

```bash
# Find what is holding a port (e.g. 3001)
lsof -i :3001          # macOS / Linux
netstat -ano | findstr :3001   # Windows

# Stop all Tikka containers and free ports
docker compose --profile full down
```

### Docker Compose says a container is unhealthy

```bash
docker compose logs <service-name>   # e.g. backend, indexer, postgres
```

Common cause: a required environment variable is missing or the backing database is not yet ready. Docker Compose will retry health checks — wait 30 seconds before concluding there is a real problem.

### `npm run install:all` fails on one package

Run the failing package in isolation to see the full error:

```bash
cd backend && npm install
```

If the error is a peer-dependency conflict, use `--legacy-peer-deps` as a last resort and open an issue describing the conflict.

### TypeScript errors after pulling latest `master`

```bash
npm run install:all   # pick up any new dependencies
```

Then re-run `npx tsc --noEmit` in the affected package. If errors persist, check whether a new required environment variable was added to `.env.example`.

### Indexer fails to connect to Postgres

Confirm the `deps` profile is running and the connection string is correct:

```bash
docker compose --profile deps ps         # Postgres should show "healthy"
psql postgres://postgres:postgres@localhost:5432/tikka_indexer -c "SELECT 1;"
```

### Redis connection refused

```bash
docker compose --profile deps ps         # Redis should show "healthy"
redis-cli -h localhost -p 6379 ping      # Expected: PONG
```

### Playwright tests time out

Playwright tests require the backend to be running at `http://localhost:3001`. Start it before running e2e tests:

```bash
docker compose --profile backend up -d
cd client && pnpm test:e2e
```

### Oracle fails to submit randomness

Check `oracle/.env.local` for:
- `ORACLE_SECRET_KEY` — must be a valid Ed25519 secret key starting with `S`.
- `SOROBAN_RPC_URL` — must be reachable from your machine.
- `RAFFLE_CONTRACT_ID` — must match a deployed contract on the configured network.

Run the oracle health endpoint to confirm the RPC connection is healthy:

```bash
curl http://localhost:3003/oracle/status
```

---

## 16. Reporting issues

Open a [GitHub Issue](https://github.com/crackedstudio/tikka/issues/new) and include:

- **Title:** short, descriptive (`[indexer] Redis connection drops under high load`)
- **Package:** which package is affected
- **Steps to reproduce:** numbered list of exact steps
- **Expected behaviour:** what should happen
- **Actual behaviour:** what actually happens
- **Environment:**
  - OS and version
  - Node.js version (`node --version`)
  - Docker version (`docker --version`)
  - Which Docker Compose profile you used
- **Logs:** paste relevant log output (use code fences)

For security vulnerabilities, do **not** open a public issue. Contact the maintainers directly.
