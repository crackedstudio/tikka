# Tikka Backend

API layer that merges indexer data with Supabase metadata; handles auth (Sign In With Stellar), image storage, and notifications. Exposes REST (and later GraphQL) for the frontend and external consumers.

**Stack:** NestJS, Fastify, Supabase, Redis.

## Intended structure (from spec)

- `src/api/rest/` — raffles, users, leaderboard, stats, search, notifications
- `src/auth/` — SIWS (nonce, verify), JWT strategy, guards
- `src/services/` — metadata, storage, indexer client, notifications, search
- `src/middleware/` — rate limit, validation (Zod), CORS
- `src/config/` — env configuration

Implementation to be added.

## Architecture

Full ecosystem spec: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) (section 4 — tikka-backend).
