# Indexer Cache TTLs and Invalidation

Redis cache-aside layer for the indexer HTTP API (`src/cache/`). PostgreSQL is always the source of truth; Redis only accelerates reads.

Canonical key helpers live in `src/cache/cache.keys.ts`. TTL constants live in `src/cache/cache.ttl.ts`. Processors invalidate keys after successful DB writes.

## Cache families

| Family | Key pattern | TTL | Written by | Invalidation trigger | Staleness tolerance |
| ------ | ----------- | --- | ---------- | -------------------- | ------------------- |
| Active raffles | `raffle:active` | 30s (`ACTIVE_RAFFLES`) | `GET /raffles` when querying open raffles only | `RaffleCreated`, `RaffleCancelled` | ≤ 30s if invalidation is missed; ~0 after a successful invalidate |
| Raffle detail | `raffle:{id}` | 10s (`RAFFLE_DETAIL`) | `GET /raffles/:id` | `TicketPurchased`, `TicketRefunded`, `RaffleFinalized`, `RaffleCancelled` | ≤ 10s if invalidation is missed; ~0 after a successful invalidate |
| Global leaderboard (users API) | `leaderboard` | 60s (`LEADERBOARD`) | `GET /users/leaderboard` (default page only: limit 20, offset 0) | `RaffleFinalized` | ≤ 60s if invalidation is missed; ~0 after a successful invalidate |
| Mode leaderboard (leaderboard API) | `leaderboard:{mode}:{limit}:0` | 60s (inline) | `GET /leaderboard` first page only | **None** — TTL-only expiry | ≤ 60s (by design) |
| User profile | `user:{address}` | 300s (`USER_PROFILE`) | `GET /users/:address` | `TicketPurchased` (buyer), `TicketRefunded` (recipient), `RaffleFinalized` (winner) | ≤ 300s if invalidation is missed; ~0 after a successful invalidate |
| Platform stats | `stats:platform` | 300s (`PLATFORM_STATS`) | `GET /stats` | `RaffleCreated`, `RaffleFinalized` | ≤ 300s if invalidation is missed; ~0 after a successful invalidate |
| Transparency log | `transparency:{limit}:{offset}[:{raffleId}][:{txHash}]` | 60s (inline) | `GET /transparency` | **None** — TTL-only expiry (append-only audit data) | ≤ 60s (by design) |

TTL values are seconds. “Staleness tolerance” is the worst-case age of a cached response clients may observe.

## Event → invalidation matrix

What each ingested event clears (union of calls from `RaffleProcessor`, `TicketProcessor`, and `UserProcessor`):

| Event | Keys invalidated |
| ----- | ---------------- |
| `RaffleCreated` | `raffle:active`, `stats:platform` |
| `TicketPurchased` | `raffle:{id}`, `user:{buyer}` |
| `TicketRefunded` | `raffle:{id}`, `user:{recipient}` |
| `RaffleFinalized` | `raffle:{id}`, `leaderboard`, `stats:platform`, `user:{winner}` |
| `RaffleCancelled` | `raffle:{id}`, `raffle:active` |

Notes:

- `TicketPurchased` / `TicketRefunded` / `RaffleFinalized` may invalidate the same key from both the ticket/raffle processor and `UserProcessor` (duplicate `DEL` is intentional and idempotent).
- Mode-scoped leaderboard keys (`leaderboard:{mode}:…`) and transparency keys are **not** event-invalidated; they rely on short TTLs.
- `CacheInvalidations` in `src/cache/cache.invalidations.ts` encodes purchase/finalize rules for reuse/tests; live processors currently call `CacheService.invalidate*` methods directly.

## Strategy summary

1. **Cache-aside**: miss → query Postgres → `SET` with TTL.
2. **Invalidate on write**: after an event is persisted, delete affected keys so the next read refills from Postgres.
3. **TTL as backstop**: if an invalidate is skipped or a key is not in the matrix, data self-heals within the family TTL (staleness tolerance above).

## Source of truth

| Concern | File |
| ------- | ---- |
| Key construction | `src/cache/cache.keys.ts` |
| TTL constants | `src/cache/cache.ttl.ts` |
| Get/set/invalidate helpers | `src/cache/cache.service.ts` |
| Structured invalidation helpers | `src/cache/cache.invalidations.ts` |
| Event-driven invalidation | `src/processors/*.processor.ts` |
