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

## Pull request checklist

- [ ] `pnpm test` passes with no new failures in the workspace you changed.
- [ ] New client UI strings are added to every supported locale and
  `pnpm --dir client check:locales` passes with zero missing or orphaned keys.
- [ ] `CONTRIBUTING.md` is updated if new integration test setup is required.
