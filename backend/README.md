# Tikka Backend

API layer that merges indexer data with Supabase metadata; handles auth (Sign In With Stellar), image storage, and notifications. Exposes REST (and later GraphQL) for the frontend and external consumers.

**Stack:** NestJS, Fastify, Supabase, Redis.

## Raffles API

### GET /raffles

List raffles with optional filters and pagination. Data comes from the indexer (contract state).

| Query param | Type    | Description                                      |
|-------------|---------|--------------------------------------------------|
| `status`    | string  | Filter by raffle status                          |
| `category`  | string  | Filter by category                               |
| `creator`   | string  | Filter by creator Stellar address                |
| `asset`     | string  | Filter by asset (e.g. XLM)                       |
| `limit`     | number  | Page size (1–100, default 20)                    |
| `offset`    | number  | Pagination offset (default 0)                    |

**Response:** `{ raffles: RaffleListItem[], total?: number }`

### GET /raffles/:id

Single raffle detail. Merges **indexer** (contract state: price, tickets, winner, status) and **Supabase** (metadata: title, description, image_url, category).

**Response:** `RaffleDetailResponse` — contract fields + `title`, `description`, `image_url`, `category`

### POST /raffles/:raffleId/metadata

Create or update raffle metadata. Body: `{ title?, description?, image_url?, category?, metadata_cid? }`. **Requires JWT** (Bearer token from SIWS).

## Auth (Sign In With Stellar — SIWS)

Protected routes require `Authorization: Bearer <token>`.

### Flow

1. **GET /auth/nonce?address=G...** — Returns `{ nonce, expiresAt, issuedAt, message }`
2. User signs the `message` in their Stellar wallet (Freighter, xBull, etc.)
3. **POST /auth/verify** — Body: `{ address, signature, nonce [, issuedAt] }` where `signature` is base64-encoded Ed25519
4. Returns `{ accessToken }` — use as `Authorization: Bearer <accessToken>`

### SIWS message format

```
tikka.io wants you to sign in
Address: G...
Nonce: abc123
Issued At: 2025-02-19T12:00:00.000Z
```

Set `SIWS_DOMAIN` to customize the domain (default: `tikka.io`).

### Manual check: protected route returns 401 without token

```bash
curl -X POST http://localhost:3001/raffles/1/metadata \
  -H "Content-Type: application/json" \
  -d '{"title":"Test"}'
# Expected: 401 Unauthorized
```

### Run e2e test

```bash
npm run test:e2e
```

## Structure

- `src/api/rest/` — raffles, users, leaderboard, stats, search, notifications
- `src/auth/` — SIWS (nonce, verify), JWT strategy, guards
- `src/services/` — metadata, storage, indexer client, notifications, search
- `src/middleware/` — rate limit, validation (Zod), CORS
- `src/config/` — env configuration

## Architecture

Full ecosystem spec: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) (section 4 — tikka-backend).
