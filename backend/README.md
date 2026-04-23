# Tikka Backend

API layer that merges indexer data with Supabase metadata; handles auth (Sign In With Stellar), image storage, and notifications. Exposes REST (and later GraphQL) for the frontend and external consumers.

**Stack:** NestJS, Fastify, Supabase, Redis.

## Raffles API

### GET /raffles

List raffles with optional filters and pagination. Data comes from the indexer (contract state).

| Query param | Type   | Description                       |
| ----------- | ------ | --------------------------------- |
| `status`    | string | Filter by raffle status           |
| `category`  | string | Filter by category                |
| `creator`   | string | Filter by creator Stellar address |
| `asset`     | string | Filter by asset (e.g. XLM)        |
| `limit`     | number | Page size (1–100, default 20)     |
| `offset`    | number | Pagination offset (default 0)     |

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

## Rate Limiting

All endpoints are protected against abuse. Limits are **per IP address**, enforced by `@nestjs/throttler`.  
When a limit is exceeded the API returns **HTTP 429** with a `Retry-After` value in the response body.

| Tier      | Endpoints                                                       | Default limit      |
| --------- | --------------------------------------------------------------- | ------------------ |
| `default` | All public API (`/raffles`, `/users`, `/leaderboard`, `/stats`) | **100 req / 60 s** |
| `nonce`   | `GET /auth/nonce`                                               | **30 req / 60 s**  |
| `auth`    | `POST /auth/verify`                                             | **10 req / 60 s**  |

### 429 response body

```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please slow down and try again.",
  "retryAfter": 42
}
```

### Configuring limits via env vars

All thresholds are overridable without code changes (see `.env.example`):

```dotenv
THROTTLE_DEFAULT_LIMIT=100   # max requests per window
THROTTLE_DEFAULT_TTL=60      # window size in seconds

THROTTLE_AUTH_LIMIT=10       # POST /auth/verify
THROTTLE_AUTH_TTL=60

THROTTLE_NONCE_LIMIT=30      # GET /auth/nonce
THROTTLE_NONCE_TTL=60
```

### Smoke-testing the rate limit

```bash
# Hit /auth/verify 11 times — the 11th must return 429
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/auth/verify
done
```

---

## Health Check

### GET /health

Returns the live status of all backend dependencies. No authentication required.

```bash
curl http://localhost:3001/health
```

**Response — all healthy (HTTP 200):**

```json
{
  "status": "ok",
  "indexer": "ok",
  "supabase": "ok",
  "timestamp": "2026-04-23T11:00:00.000Z"
}
```

**Response — dependency down (HTTP 503):**

```json
{
  "status": "degraded",
  "indexer": "error",
  "supabase": "ok",
  "timestamp": "2026-04-23T11:00:00.000Z"
}
```

| Field       | Values              | Description                                      |
| ----------- | ------------------- | ------------------------------------------------ |
| `status`    | `ok` / `degraded`   | Overall health — `degraded` if any check fails   |
| `indexer`   | `ok` / `error`      | Reachability of tikka-indexer `/health`          |
| `supabase`  | `ok` / `error`      | Reachability of Supabase REST endpoint           |
| `timestamp` | ISO 8601 string     | Time the check was performed                     |

The endpoint returns **HTTP 503** when `status` is `degraded`, so orchestrators (Kubernetes, Railway, Fly.io) can detect unhealthy instances automatically.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values before starting the server.

```bash
cp .env.example .env
```

The app validates all variables at startup using Zod. Missing or invalid required vars cause an immediate startup failure with a clear error message listing every invalid field.

### Required

These must be set or the app will refuse to start:

| Variable                   | Description                                                  |
| -------------------------- | ------------------------------------------------------------ |
| `SUPABASE_URL`             | Full URL of your Supabase project (e.g. `https://xyz.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY`| Supabase service role key (not the anon key)                 |
| `JWT_SECRET`               | Secret for signing JWTs — **minimum 32 characters**          |
| `VITE_FRONTEND_URL`        | Frontend origin allowed by CORS (e.g. `https://app.tikka.io`) |
| `ADMIN_TOKEN`              | Bearer token for `/admin/*` endpoints                        |

### Optional (with defaults)

| Variable                   | Default                    | Description                                      |
| -------------------------- | -------------------------- | ------------------------------------------------ |
| `PORT`                     | `3001`                     | HTTP port the server listens on                  |
| `INDEXER_URL`              | `http://localhost:3002`    | Base URL of the tikka-indexer internal API       |
| `INDEXER_TIMEOUT_MS`       | `5000`                     | HTTP timeout for indexer requests (ms)           |
| `JWT_EXPIRES_IN`           | `7d`                       | JWT expiry duration (e.g. `1h`, `7d`)            |
| `SIWS_DOMAIN`              | `tikka.io`                 | Domain shown in the SIWS sign-in message         |
| `ADMIN_IP_ALLOWLIST`       | `""` (allow all)           | Comma-separated CIDRs/IPs for admin access       |
| `FCM_ENABLED`              | `false`                    | Enable Firebase Cloud Messaging push notifications |
| `FCM_SERVICE_ACCOUNT_JSON` | —                          | FCM service account JSON string (for CI/secrets) |
| `FCM_SERVICE_ACCOUNT_PATH` | —                          | Path to FCM service account JSON file            |
| `THROTTLE_DEFAULT_LIMIT`   | `100`                      | Max requests per window for public endpoints     |
| `THROTTLE_DEFAULT_TTL`     | `60`                       | Rate-limit window size in seconds                |
| `THROTTLE_AUTH_LIMIT`      | `10`                       | Max requests per window for `POST /auth/verify`  |
| `THROTTLE_AUTH_TTL`        | `60`                       | Rate-limit window for auth tier (seconds)        |
| `THROTTLE_NONCE_LIMIT`     | `30`                       | Max requests per window for `GET /auth/nonce`    |
| `THROTTLE_NONCE_TTL`       | `60`                       | Rate-limit window for nonce tier (seconds)       |

---

## Structure

- `src/api/rest/` - raffles, users, leaderboard, stats, search, notifications
- `src/auth/` - SIWS (nonce, verify), JWT strategy, guards
- `src/services/` - metadata, storage, indexer client, notifications, search
- `src/middleware/` - rate limit, validation (Zod), CORS
- `src/config/` - env configuration

## Architecture

Full ecosystem spec: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) (section 4 - tikka-backend).

## Image upload endpoint

- `POST /raffles/upload-image`
- Auth: Bearer token required
- Content type: `multipart/form-data`
- File field: first uploaded file part
- Optional field: `raffleId` (used in storage path)
- Response: `{ "url": "https://..." }`

### Upload limits

- Max file size: `5 MB` (`5242880` bytes)
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`

### Required environment variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
