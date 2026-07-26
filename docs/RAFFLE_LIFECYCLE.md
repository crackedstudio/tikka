# Raffle Lifecycle Guide

> Complete flow from raffle creation through leaderboard update · A reference for builders, onboarding, and cross-package workflows

---

## Overview

A raffle's lifecycle in Tikka spans **8 components** and **6 key stages**:

| Component | Role | Repository |
|---|---|---|
| **Client** | User interface for raffle creation and participation | [client/](../client/) |
| **SDK** | Contract interaction abstraction layer | [sdk/](../sdk/) |
| **Smart Contract** | Onchain raffle state machine and enforcement | tikka-contracts |
| **Backend** | API, authentication, metadata, notifications | [backend/](../backend/) |
| **Indexer** | Blockchain event ingestion and query layer | [indexer/](../indexer/) |
| **Oracle** | Randomness computation and submission | [oracle/](../oracle/) |
| **Database** | Persistent raffle and leaderboard data (Supabase PostgreSQL) | [backend/database/](../backend/database/) |
| **Cache** | Redis for real-time data and queue management | External (Redis) |

---

## Stage 1: Raffle Creation

### Flow

1. **User initiates** in Client UI
2. **Client builds transaction** via SDK
3. **Contract executes** `create_raffle()`
4. **Backend validates metadata** and stores in Supabase
5. **Event emitted** to Stellar ledger

### Ownership & Locations

| Step | Owned By | Working Directory |
|---|---|---|
| UI/UX | **Client** | [client/src/pages/CreateRaffle.tsx](../client/src/pages/) |
| Transaction building | **SDK** | [sdk/src/modules/raffle/](../sdk/src/modules/) |
| Onchain execution | **Contract** | `tikka-contracts/contracts/raffle/src/lib.rs` |
| Metadata validation | **Backend** | [backend/src/api/rest/raffles/](../backend/src/api/rest/raffles/) |
| Event emission | **Contract** | `tikka-contracts/contracts/raffle/src/events.rs` |

### Event Emitted

```rust
RaffleCreated {
  raffle_id: u32,
  creator: Address,
  params: RaffleParams {
    asset: String,
    ticket_price: u128,
    max_tickets: u32,
    end_time: u64,
  }
}
```

### Database Tables Involved

- `raffle_metadata` (Supabase) — stores title, description, image_url, category
- Contract state — stores raffle params and state

### Sequence Diagram

```
User                 Client              SDK              Contract          Backend
 │                     │                  │                   │                 │
 ├─ Create Raffle ──▶  │                  │                   │                 │
 │                     ├─ Build Tx ──────▶ │                  │                 │
 │                     │                  ├─ Simulate & Sign ─▶ │              │
 │                     │                  │  Execute Tx        │                 │
 │                     │◀─ Tx Hash ─────── │◀─ Confirmation ──│                 │
 │                     │                  │                   │─▶ Emit Event   │
 │                     │                  │                   │                 │
 │                     │                  │                   │                 │
 │                     │                      (Event to ledger)                 │
 │                     │                          │                             │
 │                     │                          │            Store Metadata ◀─┤
 │                     │◀─ Success ────────────────────────────────────────────│
 │◀─ Raffle Created ───┤
```

---

## Stage 2: Ticket Purchase

### Flow

1. **User purchases ticket(s)** in Client UI
2. **Client builds and signs transaction** via SDK
3. **Contract executes** `buy_ticket()`
4. **Indexer listens** to emitted event
5. **Indexer processes** and writes to database
6. **Backend serves** updated raffle with ticket count

### Ownership & Locations

| Step | Owned By | Working Directory |
|---|---|---|
| UI purchase flow | **Client** | [client/src/pages/RafflePage.tsx](../client/src/pages/) |
| Transaction building | **SDK** | [sdk/src/modules/raffle/](../sdk/src/modules/) |
| Onchain logic | **Contract** | `tikka-contracts/contracts/raffle/src/ticket.rs` |
| Event listening | **Indexer** | [indexer/src/ingestor/](../indexer/src/ingestor/) |
| Event processing | **Indexer** | [indexer/src/processors/ticket.processor.ts](../indexer/src/processors/) |
| API response | **Backend** | [backend/src/api/rest/raffles/](../backend/src/api/rest/raffles/) |

### Event Emitted

```rust
TicketPurchased {
  raffle_id: u32,
  buyer: Address,
  ticket_ids: Vec<u32>,
  total_paid: u128,
  timestamp: u64,
}
```

### Database Tables Involved

- `tickets` — stores ticket records with buyer, raffle_id, purchase_timestamp
- `raffles` — updates `tickets_sold` counter
- Redis cache — invalidates raffle detail cache

### Sequence Diagram

```
User              Client           SDK          Contract        Indexer        Backend
 │                  │               │               │               │              │
 ├─ Buy Ticket ────▶│               │               │               │              │
 │                  ├─ Build Tx ───▶│               │               │              │
 │                  │               ├─ Sign & Submit ▶               │              │
 │                  │               │  Execute Tx    │               │              │
 │                  │               │◀─ Confirmation │               │              │
 │                  │◀─ Tx Hash ────┴──────────┐    │               │              │
 │                  │                          │    │               │              │
 │                  │                     Emit TicketPurchased Event │              │
 │                  │                          │    │               │              │
 │                  │                          │    ├─ Listen ─────▶│              │
 │                  │                          │    │   Process &   │              │
 │                  │                          │    │   Write DB    │              │
 │                  │                          │    │◀──────────────┤              │
 │                  │                          │    │   Invalidate  │              │
 │                  │                          │    │   Cache       │              │
 │                  │                          │    │               ├─ API ───────▶(GET /raffles/:id)
 │                  │◀─ Success ───────────────────────────────────────────────────│
 │◀─ Ticket Bought ─│
```

---

## Stage 3: Draw Request / Trigger

### Flow

1. **End time reached** or manually triggered by host
2. **Client/Backend initiates** `trigger_draw()`
3. **Contract transitions** from `OPEN` → `DRAWING`
4. **Contract emits** `DrawTriggered` event
5. **Indexer updates** raffle status to `DRAWING`

### Ownership & Locations

| Step | Owned By | Working Directory |
|---|---|---|
| Manual trigger UI | **Client** | [client/src/pages/RafflePage.tsx](../client/src/pages/) |
| Transaction building | **SDK** | [sdk/src/modules/raffle/](../sdk/src/modules/) |
| State transition | **Contract** | `tikka-contracts/contracts/raffle/src/raffle.rs` |
| Event processing | **Indexer** | [indexer/src/processors/raffle.processor.ts](../indexer/src/processors/) |
| Status update | **Backend** | [backend/src/api/rest/raffles/](../backend/src/api/rest/raffles/) |

### Event Emitted

```rust
DrawTriggered {
  raffle_id: u32,
  ledger: u32,
  timestamp: u64,
}
```

### Database Tables Involved

- `raffles` — updates status to `DRAWING`

### Sequence Diagram

```
User/Host             Client               SDK             Contract        Indexer
    │                   │                   │                  │              │
    ├─ End Time ────────│                   │                  │              │
    │ or Manual Trigger │                   │                  │              │
    │                   ├─ Build Tx ───────▶│                  │              │
    │                   │                   ├─ Invoke ────────▶│              │
    │                   │                   │ trigger_draw()    │              │
    │                   │                   │◀─ Confirmation ─▶│              │
    │                   │                   │                  │              │
    │                   │                   │                  ├─ Emit DrawTriggered
    │                   │◀─ Tx Confirmed ───┴──────────────────┴─▶│           │
    │                   │                                          ├─ Update  │
    │                   │                                          │ Status   │
    │                   │                                          │ to DRAWING
    │◀─ Draw Started ───┤
```

---

## Stage 4: Oracle Response (Randomness Computation & Submission)

### Flow

1. **Oracle listener** monitors Stellar ledger for `RandomnessRequested` event
2. **Oracle dequeues** job from Redis Bull queue
3. **Oracle computes randomness**:
   - Checks prize amount
   - Selects method: **VRF** (≥ 500 XLM) or **PRNG** (< 500 XLM)
4. **Oracle submits** `receive_randomness()` to contract
5. **Contract verifies** proof and stores randomness
6. **Contract emits** `RandomnessReceived` event

### Ownership & Locations

| Step | Owned By | Working Directory |
|---|---|---|
| Event listening | **Oracle** | [oracle/src/listener/](../oracle/src/listener/) |
| Queue management | **Oracle** | [oracle/src/queue/](../oracle/src/queue/) |
| Job enqueuing | **Oracle** | [oracle/src/queue/](../oracle/src/queue/) |
| Cost estimation | **Oracle** | [oracle/src/randomness/](../oracle/src/randomness/) |
| Randomness computation (VRF) | **Oracle** | [oracle/src/randomness/](../oracle/src/randomness/) |
| Randomness computation (PRNG) | **Oracle** | [oracle/src/randomness/](../oracle/src/randomness/) |
| Transaction submission | **Oracle** | [oracle/src/submitter/](../oracle/src/submitter/) |
| Contract interaction | **Contract** | `tikka-contracts/contracts/raffle/src/randomness.rs` |

### Events Emitted

```rust
RandomnessRequested {
  raffle_id: u32,
  request_id: BytesN<32>,
  timestamp: u64,
}

RandomnessReceived {
  raffle_id: u32,
  seed: BytesN<32>,
  proof: BytesN<64>,
  timestamp: u64,
}
```

### Randomness Method Selection

| Prize Amount | Method | Processing Time | Cost | Verifiable |
|---|---|---|---|---|
| **< 500 XLM** | PRNG (SHA-256) | Instant | ~0 XLM | Yes (deterministic) |
| **≥ 500 XLM** | VRF (Ed25519) | ~2–5s | Standard tx fee | Yes (cryptographic proof) |

- **PRNG**: `seed = SHA256(requestId || raffleId || timestamp)`
- **VRF**: Uses oracle's Ed25519 keypair to generate cryptographic proof

### Priority Queue Handling

```
RandomnessRequested Event
        │
        ▼
    Determine Prize
        │
        ├─ Tier ≥ 500 XLM ──▶ HIGH Priority (SLA: 5s)
        │
        └─ Tier < 500 XLM ──▶ NORMAL Priority
                │
        Bull Queue (Redis)
                │
    Processing Pool (5 workers)
                │
         ┌──────┴──────┐
         │             │
    VRF Service    PRNG Service
         │             │
         └──────┬──────┘
                │
        Contract Submission
```

### Sequence Diagram

```
Stellar Ledger      Oracle Listener    Queue (Redis)    Randomness Service    Contract
      │                   │                 │                   │               │
      ├─ Emit ────────────▶│                 │                   │               │
      │  RandomnessRequested                 │                   │               │
      │                   │                 │                   │               │
      │                   ├─ Enqueue ──────▶│                   │               │
      │                   │   Job           │                   │               │
      │                   │                 │                   │               │
      │                   │                 ├─ Worker Dequeue ─▶│               │
      │                   │                 │   (Check Prize)    │               │
      │                   │                 │                   ├─ Select ──┐   │
      │                   │                 │                   │ Method    │   │
      │                   │                 │                   │ (VRF/PRNG)│   │
      │                   │                 │                   │◀──────────┘   │
      │                   │                 │                   │               │
      │                   │                 │  Compute Randomness               │
      │                   │                 │  (seed + proof)    │               │
      │                   │                 │◀──────────────────│               │
      │                   │                 │                   │    Submit ───▶│
      │                   │                 │                   │ receive_randomness
      │                   │                 │                   │               │
      │                   │                 │                   │◀─ Verify ────│
      │                   │                 │                   │   & Store    │
      │                   │                 │                   │               │
      │◀───────────────────▶───────────────▶│                   ├─ Emit ────────│
      │   Randomness       │                │              RandomnessReceived
      │    Complete        │                │                   │
```

### Database Tables Involved (Indexer)

- `randomness_requests` — stores request metadata
- `randomness_responses` — stores seed and proof

---

## Stage 5: Raffle Finalization

### Flow

1. **Contract receives randomness** (from Stage 4)
2. **Contract verifies proof** (if VRF)
3. **Contract deterministically selects winner**
4. **Contract emits** `RaffleFinalized` event
5. **Indexer processes** event and updates database
6. **Backend serves** finalized raffle with winner info

### Ownership & Locations

| Step | Owned By | Working Directory |
|---|---|---|
| Winner selection logic | **Contract** | `tikka-contracts/contracts/raffle/src/payout.rs` |
| Event emission | **Contract** | `tikka-contracts/contracts/raffle/src/events.rs` |
| Event processing | **Indexer** | [indexer/src/processors/raffle.processor.ts](../indexer/src/processors/) |
| Leaderboard trigger | **Indexer** → **Backend** | [backend/src/services/](../backend/src/services/) |
| API response | **Backend** | [backend/src/api/rest/raffles/](../backend/src/api/rest/raffles/) |

### Event Emitted

```rust
RaffleFinalized {
  raffle_id: u32,
  winner: Address,
  winning_ticket_id: u32,
  prize_amount: u128,
  timestamp: u64,
}
```

### Winner Selection Algorithm

```
1. Total tickets: N
2. Random seed: R (from oracle)
3. Winner index: (R as u32) % N
4. Lookup: winning_ticket = tickets[winner_index]
5. Prize transfer: executed atomically by contract
```

### Database Tables Involved

- `raffles` — updates status to `FINALIZED`, stores winner info
- `tickets` — marks winning ticket
- Cache invalidation — clears raffle detail cache

### Sequence Diagram

```
Oracle              Contract           Indexer          Backend          User
  │                    │                  │               │               │
  ├─ Submit ───────────▶│                  │               │               │
  │ receive_randomness  │                  │               │               │
  │                    ├─ Verify Proof    │               │               │
  │                    │                  │               │               │
  │                    ├─ Select Winner   │               │               │
  │                    │                  │               │               │
  │                    ├─ Transfer Prize  │               │               │
  │                    │                  │               │               │
  │                    ├─ Emit ──────────▶│               │               │
  │                    │ RaffleFinalized  ├─ Process      │               │
  │                    │                  │  Event        │               │
  │                    │                  ├─ Update DB    │               │
  │                    │                  │               │               │
  │                    │                  ├─ Notify ─────▶│               │
  │                    │                  │              ├─ Publish ─────▶(GET /raffles/:id)
  │                    │                  │               │               │
  │                    │                  │               │   Queue for ─▶(Leaderboard Update)
  │                    │                  │               │   Leaderboard │
  │◀──────────────────────── Tx Confirmed ────────────────────────────────│
  │  Randomness Success
```

---

## Stage 6: Leaderboard Update

### Flow

1. **Raffle finalized** (from Stage 5)
2. **Indexer triggers** leaderboard update via webhook/event
3. **Backend processes** winner statistics
4. **Backend updates** leaderboard tables in Supabase
5. **Backend publishes** real-time leaderboard via WebSocket or API

### Ownership & Locations

| Step | Owned By | Working Directory |
|---|---|---|
| Event processing | **Indexer** | [indexer/src/processors/raffle.processor.ts](../indexer/src/processors/) |
| Leaderboard service | **Backend** | [backend/src/api/rest/leaderboard/](../backend/src/api/rest/leaderboard/) |
| Leaderboard controller | **Backend** | [backend/src/api/rest/leaderboard/](../backend/src/api/rest/leaderboard/) |
| Real-time updates | **Backend** | [backend/src/api/rest/](../backend/src/api/rest/) |
| Statistics | **Backend** | [backend/src/api/rest/stats/](../backend/src/api/rest/stats/) |

### Statistics Calculated

- **User wins** — total raffles won by address
- **User participation** — total raffles entered
- **User earnings** — total prize amount won
- **Global rankings** — top winners by earnings
- **Category rankings** — top winners per raffle category

### Database Tables Involved

- `leaderboard_entries` — stores user stats
- `leaderboard_snapshots` — historical snapshots (for trending)
- `user_statistics` — aggregated user performance

### Sequence Diagram

```
Indexer            Backend (Leaderboard Service)    Supabase DB    WebSocket/API
   │                          │                        │              │
   ├─ Process ───────────────▶│                        │              │
   │ RaffleFinalized Event     │                        │              │
   │                          │                        │              │
   │                          ├─ Calculate Stats ─────▶│              │
   │                          │  - Increment wins      │              │
   │                          │  - Update earnings     │              │
   │                          │  - Rank updates        │              │
   │                          │◀─ Confirmation ────────│              │
   │                          │                        │              │
   │                          ├─ Publish Update ──────────────────────▶(WS/API)
   │                          │                        │              │
   │◀─ Ack ─────────────────────────────────────────────────────────│
```

---

## Complete End-to-End Lifecycle Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TIKKA RAFFLE LIFECYCLE (E2E)                             │
└─────────────────────────────────────────────────────────────────────────────┘

     STAGE 1: RAFFLE CREATION
     ═════════════════════════════════════════════════════════════════
     Client ──▶ SDK ──▶ Contract ──▶ RaffleCreated Event ──▶ Indexer ──▶ DB
                       │                                        │
                       └──────────────────────────────────────────┘
                                    ▼
                           Backend validates metadata
                           (Supabase storage)


     STAGE 2: TICKET PURCHASE (Repeating)
     ═════════════════════════════════════════════════════════════════
     User ──▶ Client ──▶ SDK ──▶ Contract ──▶ TicketPurchased Event ──▶ Indexer
                        │                                                 │
                        └─────────────────────────────────────────────────┘
                                      ▼
                           Update tickets_sold counter
                           Cache invalidation


     STAGE 3: DRAW TRIGGER
     ═════════════════════════════════════════════════════════════════
     User/Host ──▶ Client ──▶ SDK ──▶ Contract ──▶ DrawTriggered Event ──▶ Indexer
                  │                     │                                    │
                  └──────────────────────▶ Status: OPEN → DRAWING ──────────┘


     STAGE 4: ORACLE RANDOMNESS
     ═════════════════════════════════════════════════════════════════
     Oracle Listener ──▶ Queue Job (Redis)
                            │
                            ├─ Check Prize Amount
                            │
                            ├─ < 500 XLM ──▶ PRNG Service
                            │
                            └─ ≥ 500 XLM  ──▶ VRF Service
                                    │
                                    └──▶ Compute (seed + proof)
                                            │
                                            └──▶ Contract.receive_randomness()
                                                    │
                                                    └──▶ RandomnessReceived Event


     STAGE 5: FINALIZATION
     ═════════════════════════════════════════════════════════════════
     Contract ──▶ Select Winner ──▶ Transfer Prize ──▶ RaffleFinalized Event
                        │                                    │
                        └────────────────────────────────────┘
                                      ▼
                           Indexer processes event
                           Update raffles table (winner, prize)
                           Cache invalidation


     STAGE 6: LEADERBOARD UPDATE
     ═════════════════════════════════════════════════════════════════
     Indexer ──▶ Backend (Leaderboard Service)
                        │
                        ├─ Increment user wins
                        ├─ Update earnings sum
                        ├─ Recalculate rankings
                        │
                        └──▶ Supabase (leaderboard tables)
                                    │
                                    └──▶ WebSocket/API broadcast to users
```

---

## Data Flow Summary Table

| Stage | Event | Source | Processor | Destination | Table Updated |
|---|---|---|---|---|---|
| 1 | `RaffleCreated` | Contract | — | Backend | `raffle_metadata` |
| 2 | `TicketPurchased` | Contract | `ticket.processor.ts` | Indexer → DB | `tickets`, `raffles.tickets_sold` |
| 3 | `DrawTriggered` | Contract | `raffle.processor.ts` | Indexer → DB | `raffles.status = 'DRAWING'` |
| 4a | `RandomnessRequested` | Contract | Oracle Listener | Oracle Queue | `randomness_requests` |
| 4b | `RandomnessReceived` | Contract | `raffle.processor.ts` | Indexer → DB | `randomness_responses` |
| 5 | `RaffleFinalized` | Contract | `raffle.processor.ts` | Indexer → DB | `raffles`, `tickets` (winner marked) |
| 6 | (Event trigger) | Indexer | Leaderboard Service | Backend → DB | `leaderboard_entries`, `user_statistics` |

---

## Key Cross-Package Interactions

### Client ↔ SDK

- **Responsibility**: SDK abstracts all contract interaction
- **Reference**: [sdk/src/modules/raffle/](../sdk/src/modules/)
- **Interaction**: Client consumes SDK methods for `createRaffle()`, `buyTicket()`, `triggerDraw()`

### SDK ↔ Contract

- **Responsibility**: SDK builds, simulates, signs, and submits transactions
- **Reference**: [sdk/src/](../sdk/src/)
- **Interaction**: TX building, fee estimation, keypair management

### Indexer ↔ Backend

- **Responsibility**: Indexer writes raw event data; backend enriches with metadata
- **Reference**: [backend/src/api/rest/raffles/raffles.controller.ts](../backend/src/api/rest/raffles/)
- **Interaction**: Backend queries `raffles`, `tickets`, `leaderboard_entries` tables

### Oracle ↔ Contract

- **Responsibility**: Oracle processes requests and submits randomness
- **Reference**: [oracle/src/](../oracle/src/)
- **Interaction**: Cosmos-style 2-step (request event → response submission)

### Backend ↔ Notifications

- **Responsibility**: Backend publishes updates for frontend real-time updates
- **Reference**: [backend/src/api/rest/notifications/](../backend/src/api/rest/notifications/)
- **Interaction**: WebSocket broadcasts, Push notifications (via service worker)

---

## Environment Variables & Configuration

### Client
- `VITE_RAFFLE_CONTRACT_ADDRESS` — Deployed contract address
- `VITE_SUPABASE_URL` — Backend API endpoint
- `VITE_SUPABASE_KEY` — Anonymous key for auth

### Backend
- `DATABASE_URL` — Supabase PostgreSQL connection
- `SUPABASE_URL`, `SUPABASE_KEY` — Admin keys for metadata
- `REDIS_URL` — Queue and cache support
- `ORACLE_ADDRESS` — Authorized oracle address on contract

### Indexer
- `DATABASE_URL` — Local PostgreSQL for indexer state
- `HORIZON_URL` — Stellar Horizon endpoint for event streaming
- `CONTRACT_ID` — Soroban contract ID to watch

### Oracle
- `STELLAR_NETWORK_PASSPHRASE` — Network (public or test)
- `ORACLE_KEYPAIR` — Ed25519 keypair for signing randomness
- `CONTRACT_ID` — Contract to receive randomness
- `REDIS_URL` — Queue persistence

---

## Testing the Lifecycle

### Unit Tests

- **Backend**: [backend/src/api/rest/raffles/](../backend/src/api/rest/raffles/)
- **Indexer**: [indexer/src/processors/](../indexer/src/processors/)
- **Oracle**: [oracle/src/randomness/](../oracle/src/randomness/)

### Integration Tests

- **Contract**: `tikka-contracts/tests/`
- **E2E**: [oracle/E2E_TEST_GUIDE.md](../oracle/E2E_TEST_GUIDE.md)

### Verification Checklist

- [ ] Raffle created with metadata in Supabase
- [ ] Tickets purchased and indexed correctly
- [ ] Draw triggered and status updated to `DRAWING`
- [ ] Oracle enqueues randomness job
- [ ] Randomness submitted to contract (≤ 5s for high-stakes)
- [ ] Raffle finalized with winner
- [ ] Leaderboard updated with stats
- [ ] WebSocket broadcasts winner announcement

---

## Troubleshooting

### Raffle Creation Fails
- Check `backend/src/api/rest/raffles/` — metadata validation
- Verify SIWS token valid in `Authorization` header
- Check Supabase connection string

### Tickets Not Showing Up
- Verify indexer is running and connected to Horizon
- Check `indexer/src/processors/ticket.processor.ts` — event parsing
- Query `tickets` table directly in Supabase
- Check Redis cache invalidation

### Oracle Not Processing
- Verify Oracle keypair in env vars
- Check `oracle/src/listener/` — is event listener active?
- Check Redis queue with `redis-cli` — any queued jobs?
- Check priority queue: `oracle/PRIORITY_QUEUE_QUICK_REF.md`
- Verify `ORACLE_ADDRESS` env var matches contract's authorized oracle

### Leaderboard Not Updating
- Verify raffle finalized (check `raffles.winner IS NOT NULL`)
- Check `backend/src/services/leaderboard/` — service running?
- Verify leaderboard tables created in Supabase
- Check WebSocket connection in browser console

---

## References

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Full ecosystem overview
- [backend/README.md](../backend/README.md) — API documentation
- [indexer/README.md](../indexer/README.md) — Event indexing details
- [oracle/README.md](../oracle/README.md) — Oracle design and VRF/PRNG
- [client/README.md](../client/README.md) — Frontend architecture
- [sdk/README.md](../sdk/README.md) — SDK contract interaction guide

---

## Contributing

When implementing new features or fixing issues that affect the raffle lifecycle:

1. **Identify the stage(s)** affected using this guide
2. **Reference relevant directories** when creating PRs
3. **Update tests** in the responsible service
4. **Verify end-to-end** using the checklist above
5. **Document changes** if the flow changes

See [CONTRIBUTING.md](../CONTRIBUTING.md) for full guidelines.
