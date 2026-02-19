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

Create or update raffle metadata. Body: `{ title?, description?, image_url?, category?, metadata_cid? }`.

## Structure

- `src/api/rest/` — raffles, users, leaderboard, stats, search, notifications
- `src/auth/` — SIWS (nonce, verify), JWT strategy, guards
- `src/services/` — metadata, storage, indexer client, notifications, search
- `src/middleware/` — rate limit, validation (Zod), CORS
- `src/config/` — env configuration

## Architecture

Full ecosystem spec: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) (section 4 — tikka-backend).
