# Tikka — Ecosystem Architecture

> Decentralized Raffle Platform on Stellar · Multi-Repo Specification

---

## Ecosystem Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          TIKKA ECOSYSTEM                                │
│                                                                         │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐   │
│  │tikka-frontend│────▶│  tikka-sdk   │────▶│  tikka-contracts     │   │
│  │  React/Vite  │     │   NestJS     │     │  Soroban (Rust)      │   │
│  └──────┬───────┘     └──────────────┘     └──────────┬───────────┘   │
│         │                                              │               │
│         │             ┌──────────────┐                │               │
│         └────────────▶│tikka-backend │◀───────────────┘               │
│                       │   NestJS     │                                 │
│                       └──────┬───────┘                                 │
│                              │                                          │
│              ┌───────────────┼───────────────┐                        │
│              ▼               ▼               ▼                        │
│      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐              │
│      │tikka-indexer │ │  PostgreSQL  │ │    Redis     │              │
│      │   NestJS     │ │   (Supabase) │ │   (Cache)    │              │
│      └──────┬───────┘ └──────────────┘ └──────────────┘              │
│             │                                                          │
│             ▼                                                          │
│      ┌──────────────┐                                                  │
│      │ tikka-oracle │◀──── Stellar Ledger Events                      │
│      │   NestJS     │────▶ Soroban Contract (randomness reveal)       │
│      └──────────────┘                                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

| Repository | Stack | Role |
|---|---|---|
| `tikka-contracts` | Rust, Soroban SDK | Onchain raffle logic, state machine, payouts |
| `tikka-sdk` | NestJS, TypeScript, Stellar SDK | SDK library for contract interaction |
| `tikka-indexer` | NestJS, PostgreSQL, Redis | Blockchain event ingestion & query layer |
| `tikka-backend` | NestJS, Fastify, Supabase | API, auth, metadata, notifications |
| `tikka-oracle` | NestJS, Stellar SDK | Randomness oracle — commit/reveal + VRF |
| `tikka-frontend` | React 19, Vite, TypeScript | Consumer web app |

---

## 1. `tikka-contracts`

> **Language:** Rust · **Platform:** Soroban (Stellar)

### Structure

```
tikka-contracts/
├── contracts/
│   ├── raffle/
│   │   ├── src/
│   │   │   ├── lib.rs            # Contract entry point & interface
│   │   │   ├── raffle.rs         # Raffle state machine
│   │   │   ├── ticket.rs         # Ticket purchase & validation
│   │   │   ├── randomness.rs     # Oracle adapter & PRNG fallback
│   │   │   ├── payout.rs         # Winner selection & prize distribution
│   │   │   └── events.rs         # All emitted contract events
│   │   └── Cargo.toml
│   ├── factory/
│   │   └── src/lib.rs            # Deploy new raffle instances
│   └── oracle-receiver/
│       └── src/lib.rs            # Receive & verify randomness from oracle
├── tests/                        # Soroban test harness integration tests
├── scripts/
│   ├── deploy.sh
│   ├── invoke.sh
│   └── verify.sh
└── Cargo.toml
```

### Raffle State Machine

```
OPEN ──── (end_time passed) ──▶ DRAWING ──── (oracle reveals) ──▶ FINALIZED
  │                                                                     │
  └──── (host cancels / min not met) ──▶ CANCELLED ◀───────────────────┘
```

| State | Allowed Actions |
|---|---|
| `OPEN` | `buy_ticket`, `get_raffle_data` |
| `DRAWING` | `request_randomness`, `receive_randomness` |
| `FINALIZED` | `get_winner`, `claim_prize` |
| `CANCELLED` | `refund_ticket` |

### Core Contract Interface

```rust
// ── Lifecycle ──────────────────────────────────────────────────────────
pub fn create_raffle(env, params: RaffleParams) -> u32
pub fn buy_ticket(env, raffle_id: u32, buyer: Address, qty: u32) -> Vec<u32>
pub fn trigger_draw(env, raffle_id: u32)
pub fn receive_randomness(env, raffle_id: u32, seed: BytesN<32>, proof: BytesN<64>)
pub fn cancel_raffle(env, raffle_id: u32)
pub fn refund_ticket(env, raffle_id: u32, ticket_id: u32)

// ── Queries ────────────────────────────────────────────────────────────
pub fn get_raffle_data(env, raffle_id: u32) -> RaffleData
pub fn get_active_raffle_ids(env) -> Vec<u32>
pub fn get_all_raffle_ids(env) -> Vec<u32>
pub fn get_user_tickets(env, raffle_id: u32, user: Address) -> Vec<u32>
pub fn get_user_participation(env, user: Address) -> UserParticipation

// ── Admin ──────────────────────────────────────────────────────────────
pub fn set_oracle_address(env, oracle: Address)
pub fn set_protocol_fee(env, fee_bps: u32)
pub fn withdraw_fees(env, recipient: Address)
pub fn pause(env)
pub fn unpause(env)
```

### Events

```rust
RaffleCreated        { raffle_id, creator, params }
TicketPurchased      { raffle_id, buyer, ticket_ids, total_paid }
DrawTriggered        { raffle_id, ledger }
RandomnessRequested  { raffle_id, request_id }
RandomnessReceived   { raffle_id, seed, proof }
RaffleFinalized      { raffle_id, winner, winning_ticket_id, prize_amount }
RaffleCancelled      { raffle_id, reason }
TicketRefunded       { raffle_id, ticket_id, recipient, amount }
```

### Randomness Design

- **Low-stakes** (< 500 XLM): Soroban ledger-seeded PRNG — instant, zero cost
- **High-stakes** (≥ 500 XLM): Oracle-assisted VRF — cryptographically unpredictable, onchain-verifiable
- The contract calls `request_randomness()` which emits an event; the oracle listens, computes, and calls back `receive_randomness()` with a seed + proof
- Contract verifies the proof before accepting the seed

---

## 2. `tikka-sdk`

> **Stack:** NestJS · TypeScript · Stellar SDK · Published as `@tikka/sdk`

The SDK is a first-class NestJS library that abstracts all Soroban contract interaction — transaction building, simulation, fee estimation, signing, and submission. The frontend and any third-party integrators consume this instead of touching Soroban directly.

### Structure

```
tikka-sdk/
├── src/
│   ├── tikka-sdk.module.ts          # NestJS root module
│   ├── tikka-sdk.service.ts         # Main SDK entry point
│   ├── modules/
│   │   ├── raffle/
│   │   │   ├── raffle.module.ts
│   │   │   ├── raffle.service.ts    # create, get, list, cancel
│   │   │   └── raffle.types.ts
│   │   ├── ticket/
│   │   │   ├── ticket.module.ts
│   │   │   ├── ticket.service.ts    # buy, refund, query
│   │   │   └── ticket.types.ts
│   │   └── user/
│   │       ├── user.module.ts
│   │       └── user.service.ts      # participation history
│   ├── contract/
│   │   ├── bindings.ts              # Auto-generated Soroban bindings
│   │   ├── contract.service.ts      # Raw XDR tx builder & submitter
│   │   └── constants.ts             # Contract addresses per network
│   ├── wallet/
│   │   ├── wallet.interface.ts      # WalletAdapter abstract interface
│   │   ├── freighter.adapter.ts
│   │   ├── xbull.adapter.ts
│   │   ├── albedo.adapter.ts
│   │   └── lobstr.adapter.ts
│   ├── network/
│   │   ├── network.module.ts
│   │   ├── rpc.service.ts           # Soroban RPC client
│   │   └── horizon.service.ts       # Horizon client
│   └── utils/
│       ├── formatting.ts
│       ├── validation.ts
│       └── errors.ts
├── tests/
│   ├── unit/
│   └── integration/                 # Tests against Stellar testnet
├── examples/
└── package.json
```

### API Design

```typescript
// Instantiate
const tikka = new TikkaSdkService({
  network: 'testnet',
  wallet: new FreighterAdapter(),
});

// Create a raffle
const raffle = await tikka.raffle.create({
  ticketPrice: '10',          // XLM, as string (avoids float precision)
  maxTickets: 500,
  endTime: Date.now() + 86400000,
  allowMultiple: true,
  asset: 'XLM',               // or SEP-41 token address
  metadataCid: 'ipfs://...',  // links to off-chain metadata
});
// → { raffleId, txHash, ledger }

// Buy tickets
const purchase = await tikka.ticket.buy({
  raffleId: 1,
  quantity: 3,
});
// → { ticketIds, txHash, ledger, feePaid }

// Query
const data    = await tikka.raffle.get(raffleId);
const history = await tikka.user.getParticipation(stellarAddress);
const active  = await tikka.raffle.listActive();
```

### Transaction Lifecycle (internal)

```
simulate tx → estimate fee → build XDR → request wallet signature → submit → poll confirmation
```

### Wallet Adapters

| Wallet | Priority | Notes |
|---|---|---|
| Freighter | 1 | Dominant browser extension |
| xBull | 2 | Mobile-friendly |
| Albedo | 3 | No extension required |
| LOBSTR | 4 | Large retail user base |
| Rabet | 5 | Lightweight extension |

### Publishing

- Published to npm as `@tikka/sdk`
- Semver: contract ABI break → major bump
- Contract bindings auto-generated via `stellar contract bindings typescript`
- Shared types via `@tikka/types` package

---

## 3. `tikka-indexer`

> **Stack:** NestJS · PostgreSQL · Redis · Horizon API

The indexer is a persistent NestJS service that subscribes to Stellar ledger events, decodes Tikka contract events, and writes structured data to PostgreSQL. It powers all historical query features — leaderboard, user history, analytics, search — without hammering Soroban RPC.

### Structure

```
tikka-indexer/
├── src/
│   ├── app.module.ts
│   ├── ingestor/
│   │   ├── ingestor.module.ts
│   │   ├── ledger-poller.service.ts     # Poll Horizon /events (SSE or polling)
│   │   ├── event-parser.service.ts      # Decode XDR Soroban events → domain types
│   │   └── cursor-manager.service.ts    # Persist last-processed ledger (resumable)
│   ├── processors/
│   │   ├── processors.module.ts
│   │   ├── raffle.processor.ts          # RaffleCreated, Finalized, Cancelled
│   │   ├── ticket.processor.ts          # TicketPurchased, Refunded
│   │   ├── user.processor.ts            # Build user participation index
│   │   └── stats.processor.ts           # Platform aggregate stats
│   ├── database/
│   │   ├── database.module.ts
│   │   ├── entities/
│   │   │   ├── raffle.entity.ts
│   │   │   ├── ticket.entity.ts
│   │   │   ├── user.entity.ts
│   │   │   ├── raffle-event.entity.ts
│   │   │   └── platform-stat.entity.ts
│   │   └── migrations/
│   ├── cache/
│   │   ├── cache.module.ts
│   │   └── cache.service.ts             # Redis TTL strategies per data type
│   ├── api/
│   │   ├── api.module.ts                # Internal HTTP API for backend to query
│   │   └── controllers/
│   │       ├── raffles.controller.ts
│   │       ├── users.controller.ts
│   │       └── stats.controller.ts
│   └── health/
│       ├── health.module.ts
│       └── health.controller.ts         # /health — lag, DB, Redis checks
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
└── package.json
```

### Data Model (PostgreSQL)

```sql
raffles (
  id, creator, status, ticket_price, asset, max_tickets,
  tickets_sold, end_time, winner, prize_amount,
  created_ledger, finalized_ledger, metadata_cid, created_at
)

tickets (
  id, raffle_id, owner, purchased_at_ledger,
  purchase_tx_hash, refunded, refund_tx_hash
)

users (
  address, total_tickets_bought, total_raffles_entered,
  total_raffles_won, total_prize_xlm, first_seen_ledger, updated_at
)

raffle_events (
  id, raffle_id, event_type, ledger, tx_hash, payload_json, indexed_at
)

platform_stats (
  date, total_raffles, total_tickets, total_volume_xlm,
  unique_participants, prizes_distributed_xlm
)

indexer_cursor (
  id, last_ledger, last_paging_token, updated_at
)
```

### Ingestion Pipeline

```
Horizon /events (SSE)
        │
        ▼
LedgerPoller  ──── new events ────▶  EventParser  (XDR decode)
                                            │
                               ┌────────────┼────────────┐
                               ▼            ▼            ▼
                        RaffleProcessor TicketProcessor UserProcessor
                               │            │            │
                               └────────────┴────────────┘
                                            │
                                     PostgreSQL upsert
                                     (single tx, idempotent)
                                            │
                                     Redis cache invalidation
                                            │
                                     CursorManager.save()
```

### Resilience

- **Resumable**: cursor persisted to DB; crash-safe restart
- **Idempotent**: all upserts keyed by `tx_hash` — safe to replay
- **Gap detection**: if ledger sequence jumps, backfill from Horizon archive
- **Lag alerting**: webhook alert if indexer falls > 100 ledgers behind
- **Retry**: exponential backoff on Horizon API failures

### Cache TTL Strategy

| Data | TTL | Invalidation |
|---|---|---|
| Active raffle list | 30s | On `RaffleCreated` event |
| Raffle detail | 10s | On any event for that `raffle_id` |
| Leaderboard | 60s | On `RaffleFinalized` event |
| User profile | 30s | On `TicketPurchased` for that user |
| Platform stats | 5min | On daily rollup cron |

---

## 4. `tikka-backend`

> **Stack:** NestJS · Fastify · Supabase · Redis

The backend is the API layer — it merges contract data from the indexer with off-chain metadata from Supabase, handles auth, image storage, notifications, and exposes everything via REST and GraphQL.

### Structure

```
tikka-backend/
├── src/
│   ├── app.module.ts
│   ├── api/
│   │   ├── rest/
│   │   │   ├── raffles/
│   │   │   │   ├── raffles.module.ts
│   │   │   │   ├── raffles.controller.ts
│   │   │   │   └── raffles.service.ts
│   │   │   ├── users/
│   │   │   ├── leaderboard/
│   │   │   ├── stats/
│   │   │   ├── search/
│   │   │   └── notifications/
│   │   └── graphql/
│   │       ├── schema.graphql
│   │       └── resolvers/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts       # /auth/nonce, /auth/verify
│   │   ├── auth.service.ts          # SIWS — Sign In With Stellar
│   │   ├── jwt.strategy.ts
│   │   └── guards/
│   ├── services/
│   │   ├── metadata.service.ts      # Supabase CRUD for raffle metadata
│   │   ├── storage.service.ts       # Image upload (Supabase Storage)
│   │   ├── indexer.service.ts      # HTTP client to tikka-indexer internal API
│   │   ├── notification.service.ts  # Email / push on win & draw
│   │   └── search.service.ts        # Full-text search (pg tsvector)
│   ├── middleware/
│   │   ├── rate-limit.middleware.ts
│   │   ├── validation.pipe.ts       # Zod schemas
│   │   └── cors.middleware.ts
│   ├── config/
│   │   └── env.config.ts
│   └── database/
│       └── supabase.service.ts
├── docker/
└── package.json
```

### REST API

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/raffles` | — | List raffles (filter: status, category, creator, asset) |
| `GET` | `/raffles/:id` | — | Raffle detail (contract data + metadata merged) |
| `POST` | `/raffles/metadata` | SIWS | Upload title, description, image, category |
| `GET` | `/users/:address` | — | User profile + win/entry stats |
| `GET` | `/users/:address/history` | — | Paginated raffle history |
| `GET` | `/leaderboard` | — | Top participants by wins, volume, tickets |
| `GET` | `/stats/platform` | — | Platform-wide aggregates |
| `GET` | `/search?q=` | — | Full-text search over raffle metadata |
| `POST` | `/notifications/subscribe` | SIWS | Subscribe to win/draw notifications |
| `GET` | `/auth/nonce` | — | Get signing nonce for SIWS |
| `POST` | `/auth/verify` | — | Verify wallet signature, issue JWT |

### Authentication: Sign In With Stellar (SIWS)

```
1. GET  /auth/nonce?address=G...
   ← { nonce: 'abc123', expiresAt: ... }

2. User signs message in wallet:
   "tikka.io wants you to sign in
    Address: G...
    Nonce: abc123
    Issued At: 2025-02-19T..."

3. POST /auth/verify  { address, signature, nonce }
   ← { accessToken: "eyJ..." }

4. Client sends:  Authorization: Bearer eyJ...
```

### Data Merging Pattern

```
GET /raffles/:id response =
  indexer.getRaffle(id)          // contract state: price, tickets, winner, status
  + supabase.getMetadata(id)     // off-chain: title, description, image_url, category
  + indexer.getRaffleStats(id)   // tickets_sold, participant_count
```

### Notifications

| Trigger | Channel | Recipient |
|---|---|---|
| Raffle ends | Email + Push | All participants |
| Winner selected | Email | Winner only |
| New raffle in followed category | Push | Subscribed users |
| Refund available (cancelled raffle) | Email | All ticket holders |

---

## 5. `tikka-oracle`

> **Stack:** NestJS · Stellar SDK · Soroban SDK

The oracle is a standalone NestJS service responsible for generating verifiable randomness and submitting it back to the Soroban contract. It is the only service authorized (via the contract's `set_oracle_address`) to call `receive_randomness()`. It is **not** a trusted party for the outcome — the contract independently verifies the proof.

### Structure

```
tikka-oracle/
├── src/
│   ├── app.module.ts
│   ├── listener/
│   │   ├── listener.module.ts
│   │   └── event-listener.service.ts   # Watch for RandomnessRequested events
│   ├── randomness/
│   │   ├── randomness.module.ts
│   │   ├── vrf.service.ts              # Ed25519 VRF computation
│   │   ├── prng.service.ts             # Fallback PRNG for low-stakes
│   │   └── commitment.service.ts       # Commit-reveal scheme management
│   ├── submitter/
│   │   ├── submitter.module.ts
│   │   └── tx-submitter.service.ts     # Build & submit reveal tx to Soroban
│   ├── keys/
│   │   ├── key.module.ts
│   │   └── key.service.ts              # Oracle keypair management (HSM-ready)
│   ├── queue/
│   │   ├── queue.module.ts
│   │   └── randomness.queue.ts         # Bull queue for pending requests
│   └── health/
│       └── health.controller.ts
├── docker/
└── package.json
```

### Randomness Flow

```
Contract emits RandomnessRequested { raffle_id, request_id }
          │
          ▼
EventListenerService (watches Horizon SSE)
          │
          ▼
Enqueue { raffle_id, request_id } in Bull queue
          │
          ▼
RandomnessWorker picks up job
          │
     ┌────┴────────────────────────────────────┐
     │ Is prize >= 500 XLM?                    │
     │  YES → VrfService.compute(request_id)   │
     │  NO  → PrngService.compute(request_id)  │
     └────┬────────────────────────────────────┘
          │  → { seed: BytesN<32>, proof: BytesN<64> }
          ▼
TxSubmitterService
  - builds Soroban tx calling receive_randomness(raffle_id, seed, proof)
  - signs with oracle keypair
  - submits & confirms
          │
          ▼
Contract verifies proof → selects winner → emits RaffleFinalized
```

### VRF (Verifiable Random Function)

```typescript
// Ed25519 VRF — oracle key signs the request_id as input
// Anyone can verify: vrf_verify(oracle_pubkey, request_id, proof, seed) == true
// The contract stores oracle_pubkey and runs this verification onchain

vrf_compute(privateKey, input: request_id) → { seed, proof }
vrf_verify(publicKey, input, proof, seed)  → boolean
```

### Commit-Reveal (Alternative for high-stakes)

```
Round 1 (before end_time):
  Oracle calls commit_randomness(raffle_id, commitment)
  commitment = SHA-256(secret || nonce)

Round 2 (after end_time):
  Oracle calls reveal_randomness(raffle_id, secret, nonce)
  Contract verifies: SHA-256(secret || nonce) == commitment → seeds winner selection
```

This prevents the oracle from observing ticket purchases after committing, eliminating front-running.

### Security Properties

| Property | Mechanism |
|---|---|
| **Unpredictability** | VRF output is unpredictable without oracle private key |
| **Verifiability** | Anyone can verify `vrf_verify(pubkey, input, proof, seed)` |
| **Non-manipulability** | Oracle cannot choose the seed — it's deterministic from input |
| **Front-running resistance** | Commit-reveal: oracle commits before end_time, reveals after |
| **Liveness** | Bull queue with retry; fallback alert if reveal not submitted within N ledgers |
| **Key security** | Oracle keypair stored in HSM or secrets manager (not in env) |

### Oracle Monitoring

- Alert if `RandomnessRequested` event not fulfilled within 100 ledgers
- Alert on queue depth > 10 pending requests
- Alert on failed tx submission (with auto-retry up to 5 times)
- Public endpoint `/oracle/status` for health check

---

## 6. `tikka-frontend` (Updated Role)

> **Stack:** React 19 · Vite · TypeScript · `@tikka/sdk`

With the SDK and backend in place, the frontend becomes a thin consumer layer.

### Data Flow

```
Reads:  Frontend → tikka-backend REST API → indexer DB + Supabase
Writes: Frontend → @tikka/sdk → Soroban RPC → Stellar blockchain
```

### Create Raffle Flow

```
1. User fills form
2. POST /raffles/metadata  → backend stores image + metadata → returns metadataCid
3. tikka.raffle.create({ ...params, metadataCid })
4. SDK simulates → user signs in Freighter → SDK submits
5. On confirm → redirect to /raffles/:id
6. Indexer picks up RaffleCreated → DB populated
7. GET /raffles/:id returns full raffle (contract + metadata merged)
```

### What Changes vs. Current Alpha

| Before | After |
|---|---|
| Direct Soroban RPC calls | All writes via `@tikka/sdk` |
| `demoRaffles.ts` mock data | Real data from `GET /raffles` |
| No auth | SIWS JWT auth |
| Stub `createRaffle` / `buyTicket` | Real SDK calls with wallet signing |
| Leaderboard UI only | Real data from `GET /leaderboard` |
| No user history | Real history from `GET /users/:addr/history` |

---

## 7. Shared Package: `@tikka/types`

> Single npm package of shared TypeScript interfaces used across all repos.

```typescript
// Domain types
RaffleData, RaffleParams, RaffleStatus
TicketData, PurchaseResult
UserProfile, UserParticipation
PlatformStats, LeaderboardEntry

// API types
RaffleListResponse, RaffleDetailResponse
CreateMetadataRequest, CreateMetadataResponse
AuthNonceResponse, AuthVerifyRequest

// Contract event types
RaffleCreatedEvent, TicketPurchasedEvent
RaffleFinalizedEvent, RandomnessRequestedEvent
```

---

## 8. Infrastructure & DevOps

### Hosting

| Service | Platform |
|---|---|
| `tikka-frontend` | Vercel (edge CDN, preview deploys) |
| `tikka-backend` | Railway / Fly.io (auto-scale) |
| `tikka-indexer` | Railway / Fly.io (persistent, keep-alive) |
| `tikka-oracle` | Fly.io (persistent, low-latency to Horizon) |
| PostgreSQL | Supabase (managed, PITR backups) |
| Redis | Upstash (serverless) |
| Image Storage | Supabase Storage |

### Environments

| Env | Stellar Network | Notes |
|---|---|---|
| `local` | Testnet | Friendbot funding, mock wallet allowed |
| `staging` | Testnet | Full integration, CI deploys here on merge |
| `production` | Mainnet | Audited contract, real funds |

### CI/CD (GitHub Actions — per repo)

```
PR opened     → lint + typecheck + unit tests + preview deploy
Merge to main → integration tests → staging deploy
Tag vX.Y.Z    → production deploy
               + npm publish (SDK, types packages)
               + contract deploy script (contracts repo)
```

### NestJS Common Modules (all NestJS repos)

```
ConfigModule   → typed env via @nestjs/config + Joi validation
LoggerModule   → Pino structured JSON logging
HealthModule   → /health endpoint (Terminus)
SentryModule   → error tracking
```

---

## 9. Implementation Roadmap

### Phase 1 — Contracts & SDK (Weeks 1–4)
- Deploy Soroban raffle contract to testnet
- Set up `tikka-oracle` with PRNG fallback (VRF in Phase 3)
- Publish `@tikka/sdk` v0.1 and `@tikka/types` v0.1
- Wire frontend to SDK (replace all stubs)

### Phase 2 — Indexer & Backend (Weeks 5–8)
- Launch `tikka-indexer` (Horizon polling, event processing, PostgreSQL)
- Launch `tikka-backend` (REST API, SIWS auth, metadata, data merging)
- Connect frontend to backend for all reads (replace demo data)
- Implement metadata + image upload flow

### Phase 3 — Oracle VRF & Notifications (Weeks 9–12)
- Upgrade oracle from PRNG to Ed25519 VRF
- Implement commit-reveal for high-stakes raffles
- Notification system (email on win, draw alerts)
- Full-text search, leaderboard, user history
- Unit + integration tests across all repos

### Phase 4 — Mainnet & Scale (Weeks 13+)
- Smart contract security audit
- Mainnet deployment
- GraphQL API
- SDK docs site (TypeDoc)
- HSM key management for oracle
- DAO and creator tool integrations via SDK

---

## 10. Repository Summary

| Repo | Language | Primary Consumers | Phase |
|---|---|---|---|
| `tikka-contracts` | Rust | SDK, Oracle | 1 |
| `tikka-sdk` | NestJS / TS | Frontend, third-party devs | 1 |
| `tikka-oracle` | NestJS / TS | Soroban contract (callback) | 1 |
| `tikka-indexer` | NestJS / TS | Backend | 1 |
| `tikka-backend` | NestJS / TS | Frontend, external consumers | 2 |
| `tikka-frontend` | React / TS | End users | Ongoing |
| `@tikka/types` | TS (npm pkg) | All repos | 1 |

---

*Tikka Architecture · February 2025 · v1.0*
