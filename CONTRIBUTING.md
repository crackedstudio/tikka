# Contributing to Tikka

## Development setup

```bash
# Install all workspace dependencies
pnpm install

# Start the backend, client, and indexer in watch mode
pnpm dev
```

## Running unit tests

Unit tests run without any external services and are safe to run in CI.

```bash
# All packages
pnpm test

# A single package
pnpm --filter sdk  test
pnpm --filter client test
pnpm --filter backend test
```

## Integration Tests

Integration tests make real network calls (Stellar testnet, local backend) and are
**opt-in only**. They are gated behind the `TEST_INTEGRATION=true` environment variable
so they never run during normal `pnpm test` passes.

### Prerequisites

| Requirement | How to start |
|---|---|
| Stellar testnet reachable | Public endpoints are used automatically; no action needed. |
| Local backend running | `pnpm --filter backend dev` (default port 3000) |
| Local database running | `docker compose up -d db redis` |

### SEP-10 / SIWS authentication integration tests

File: `sdk/src/test/sep10-integration.spec.ts`

These tests cover:
1. **SDK SEP-10 primitives** — `buildChallenge` + `verifyResponse` executed against
   a freshly-funded Stellar testnet keypair (no backend required for this group).
2. **Backend SIWS auth round-trip** — full flow against a locally-running backend:
   `GET /auth/nonce` → sign message → `POST /auth/verify` → assert valid JWT.

#### Running the SEP-10 integration tests

```bash
# With default backend URL (http://localhost:3000)
TEST_INTEGRATION=true pnpm --filter sdk test

# With a custom backend URL
TEST_INTEGRATION=true BACKEND_URL=http://localhost:4000 pnpm --filter sdk test

# Run only the integration spec
TEST_INTEGRATION=true pnpm --filter sdk test -- --testPathPattern=sep10-integration
```

#### Environment variables

| Variable | Default | Description |
|---|---|---|
| `TEST_INTEGRATION` | `false` | Set to `true` to enable integration tests. |
| `BACKEND_URL` | `http://localhost:3000` | Base URL of the locally-running backend. |
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

- [ ] `pnpm test` passes with no new failures.
- [ ] New public APIs include JSDoc.
- [ ] Integration tests (if added) are gated behind `TEST_INTEGRATION=true`.
- [ ] `CONTRIBUTING.md` is updated if new integration test setup is required.
