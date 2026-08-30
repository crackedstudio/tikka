# Contributing to Tikka

This repository is split into several runnable workspaces. The fastest way to get a fresh clone working is:

1. Install the tooling you need for the workspace you are touching.
2. Copy the workspace env example file(s) to the expected local file names.
3. Start shared Postgres and Redis services from the repository root.
4. Run the workspace's dev server or its tests.

## Prerequisites

- Node.js and pnpm
- Docker Desktop or Docker Engine with Compose v2

## Shared services (Postgres + Redis)

The repository-root Compose file provides the local infrastructure used by the backend, indexer, and oracle.

```bash
# From the repository root
cp .env.example .env

docker compose --profile deps up -d
```

To stop them later:

```bash
docker compose --profile deps down -v
```

## Per-workspace quickstart

### Root / orchestration

Use the root workspace only for shared Compose services and repo-level scripts.

```bash
pnpm install
```

No package-level dev server exists at the root; use the package-specific commands below.

### Backend

```bash
cd backend
pnpm install
cp .env.example .env.local
pnpm start:dev
```

- The backend expects local Postgres/Redis from the repository root.
- The default development port is `3001`.
- Run tests with:

```bash
pnpm test
```

### Client

```bash
cd client
pnpm install
cp .env.example .env
pnpm dev
```

## Package manager policy

Use pnpm for every package root in this repository so each package has a single canonical lockfile:

- Root package: pnpm
- Client workspace: pnpm
- Backend workspace: pnpm
- SDK workspace: pnpm
- Indexer workspace: pnpm
- Oracle workspace: pnpm

Use the package manager that matches the package root you are working in. Do not add or commit npm lockfiles such as package-lock.json in these directories.

- The client uses Vite and expects the backend at `http://localhost:3001` by default.
- Run tests with:

```bash
pnpm test
```

### Indexer

```bash
cd indexer
pnpm install
cp .env.example .env.local
pnpm start:dev
```

- The indexer expects local Postgres/Redis from the repository root.
- Run tests with:

```bash
pnpm test
```

### Oracle

```bash
cd oracle
pnpm install
cp .env.example .env.local
pnpm start:dev
```

- The oracle expects local Redis from the repository root.
- Run tests with:

```bash
pnpm test
```

### SDK

```bash
cd sdk
pnpm install
cp examples/.env.example .env
```

- The SDK does not require a local env file for unit tests, but the example scripts use the copied env file.
- Run tests with:

```bash
pnpm test
```

## Docker Compose usage

The repository root `docker-compose.yml` supports profiles for the main services:

```bash
# Shared infrastructure only
docker compose --profile deps up -d

# Backend + deps
docker compose --profile backend up -d

# Indexer + deps
docker compose --profile indexer up -d

# Oracle + deps
docker compose --profile oracle up -d

# Full stack except the client
docker compose --profile full up -d

# Full stack plus the Vite client
docker compose --profile client up -d
```

Use the same command with `down -v` to tear everything down.

## Running unit tests

Unit tests run without any external services and are safe to run in CI.

The three root commands cover all five packages in one shot:

```bash
# From the repository root
pnpm lint       # ESLint across all packages
pnpm test       # Jest (backend / indexer / oracle / sdk) + Vitest (client)
pnpm typecheck  # tsc --noEmit across all packages
```

All three are wired into the husky `pre-push` hook, so they run automatically
before every `git push`. You can also run them per-workspace if you want faster
feedback while working on a single package:

```bash
# From the repository root
pnpm --dir backend test
pnpm --dir client test
pnpm --dir indexer test
pnpm --dir oracle test
pnpm --dir sdk test
```

## Integration tests

Integration tests make real network calls (Stellar testnet, local backend) and are
**opt-in only**. They are gated behind the `TEST_INTEGRATION=true` environment variable
so they never run during normal test passes.

### Prerequisites

| Requirement | How to start |
|---|---|
| Stellar testnet reachable | Public endpoints are used automatically; no action needed. |
| Local backend running | `cd backend && pnpm start:dev` (default port `3001`) |
| Local database running | `docker compose --profile deps up -d` |

### SEP-10 / SIWS authentication integration tests

File: `sdk/src/test/sep10-integration.spec.ts`

These tests cover:
1. **SDK SEP-10 primitives** — `buildChallenge` + `verifyResponse` executed against
a freshly-funded Stellar testnet keypair (no backend required for this group).
2. **Backend SIWS auth round-trip** — full flow against a locally-running backend:
`GET /auth/nonce` → sign message → `POST /auth/verify` → assert valid JWT.

#### Running the SEP-10 integration tests

```bash
# With default backend URL (http://localhost:3001)
TEST_INTEGRATION=true pnpm --dir sdk test

# With a custom backend URL
TEST_INTEGRATION=true BACKEND_URL=http://localhost:4000 pnpm --dir sdk test

# Run only the integration spec
TEST_INTEGRATION=true pnpm --dir sdk test -- --testPathPattern=sep10-integration
```

#### Environment variables

| Variable | Default | Description |
|---|---|---|
| `TEST_INTEGRATION` | `false` | Set to `true` to enable integration tests. |
| `BACKEND_URL` | `http://localhost:3001` | Base URL of the locally-running backend. |
| `SEP10_ANCHOR_DOMAIN` | `tikka.io` | Anchor domain used in challenge messages. |

#### What the tests assert

- Friendbot funds a fresh testnet keypair before the suite begins.
- `buildChallenge` + `verifyResponse` succeed end-to-end.
- Expired challenges are rejected with `ChallengeExpired`.
- Replay attacks are rejected by the in-memory nonce store.
- `GET /auth/nonce` returns a `{ nonce, issuedAt, message }` payload.
- Signing the message and posting to `POST /auth/verify` returns a well-formed JWT
  whose payload contains the signer's Stellar address.
- Wrong signature → 400.
- Replayed (already-consumed) nonce → 400.

### RPC integration tests

File: `sdk/src/test/rpc-integration.spec.ts`

These are currently mock-based and run as part of the normal unit test suite.
A future issue will convert them to use a real Soroban testnet endpoint.

## SDK bundle size

The SDK enforces gzip size budgets on the read-only and light entry points via
`size-limit`. See [sdk/README.md — Bundle size budget and size-check workflow](./sdk/README.md#bundle-size-budget-and-size-check-workflow)
for current limits, how to run `pnpm --filter sdk size-check`, and remediation
steps when a PR grows the bundle.

```bash
pnpm --filter sdk run build:read
pnpm --filter sdk run build:light
pnpm --filter sdk run size-check
```

## Commit message convention

This repository enforces machine-readable commit messages using [Conventional Commits](https://www.conventionalcommits.org/) and `@commitlint/cli`. This allows release tooling and CI jobs to reason about scope alongside Changesets (`pnpm changeset`).

### Format

```
<type>(<scope>): <short summary>
```

### Allowed types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semi-colons, etc.)
- `refactor`: Code changes that neither fix a bug nor add a feature
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `build`: Changes that affect the build system or external dependencies
- `ci`: Changes to CI configuration files and scripts
- `chore`: Other changes that don't modify src or test files
- `revert`: Reverts a previous commit

### Allowed scopes

Scope must match one of the defined package/workspace names:

- `client` — Frontend application (`client/`)
- `sdk` — Client SDK package (`sdk/`)
- `backend` — Backend service (`backend/`)
- `indexer` — Data indexer service (`indexer/`)
- `oracle` — Oracle service (`oracle/`)
- `repo` — Monorepo root, shared scripts, dependencies, or configuration
- `docs` — Repository documentation (`docs/`)

### Examples

**Valid commit messages:**
- `feat(client): add wallet connection state indicator`
- `fix(sdk): resolve challenge verification timeout`
- `docs(repo): update release workflow documentation`
- `chore(backend): bump dependency versions`

**Invalid commit messages:**
- `added new feature` *(missing type and scope)*
- `feat: update UI` *(missing scope)*
- `feat(frontend): add wallet button` *(invalid scope `frontend`, must be `client`)*

### Enforcement

- **Locally**: A Husky `commit-msg` hook validates commit messages automatically before commits are created.
- **CI**: The `commitlint` CI job validates all commit messages on pull requests and pushes to `master`.

## Pull request checklist

- [ ] `pnpm lint` passes with no new errors or warnings.
- [ ] `pnpm test` passes with no new failures in the workspace(s) you changed.
- [ ] `pnpm typecheck` passes with no new type errors.
- [ ] Commit messages follow the Conventional Commits specification with a valid scope (`client`, `sdk`, `backend`, `indexer`, `oracle`, `repo`, `docs`).
- [ ] New client UI strings are added to every supported locale and
  `pnpm --dir client check:locales` passes with zero missing or orphaned keys.
- [ ] `CONTRIBUTING.md` is updated if new integration test setup is required.
- [ ] SDK PRs that touch public exports or read/light entry graphs:
  `pnpm --filter sdk size-check` passes (see SDK bundle size section above).

