# Soroban Contract Integration Boundary

> **Scope:** External Soroban contracts for the Tikka raffle platform  
> **Audience:** SDK, indexer, oracle, backend, and client developers  
> **Status:** Living document — update after each contract deployment

---

## Overview

Tikka integrates with two primary Soroban contracts deployed on the Stellar network:

1. **Raffle Contract** — Core raffle state machine, ticket sales, winner selection
2. **Factory Contract** (optional) — Deploy new raffle instances

These contracts are **external to this repository** and define the boundary conditions that all SDK, indexer, oracle, backend, and client code must respect.

---

## Required Contract IDs

Contract addresses vary by network. All are configured via environment variables or SDK defaults.

### Raffle Contract

| Network | Env Var | Testnet Default | Mainnet Default |
|---------|---------|-----------------|-----------------|
| **Testnet** | `TIKKA_CONTRACT_TESTNET` | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` | N/A |
| **Mainnet** | `TIKKA_CONTRACT_MAINNET` | N/A | (empty — set after deployment) |
| **Standalone** | `TIKKA_CONTRACT_STANDALONE` | (empty — local dev) | N/A |

**Source:** [`sdk/src/contract/constants.ts`](../../sdk/src/contract/constants.ts)

### Factory Contract (optional)

| Network | Env Var | Purpose |
|---------|---------|---------|
| **Testnet** | `TIKKA_FACTORY_TESTNET` | Deploy new raffle instances on testnet |
| **Mainnet** | `TIKKA_FACTORY_MAINNET` | Deploy new raffle instances on mainnet |
| **Standalone** | `TIKKA_FACTORY_STANDALONE` | Deploy new raffle instances locally |

---

## Contract Interface

### Core Methods

All method names must exactly match the Rust `pub fn` declarations in the contract. Changing a method name or signature breaks compatibility.

#### Lifecycle Methods

| Method | Parameters | Returns | Role |
|--------|-----------|---------|------|
| **`create_raffle`** | `params: RaffleParams` | `u32` (raffle_id) | Create a new raffle, emit `RaffleCreated` |
| **`buy_ticket`** | `raffle_id: u32, buyer: Address, qty: u32` | `Vec<u32>` (ticket_ids) | Purchase one or more tickets, emit `TicketPurchased` |
| **`trigger_draw`** | `raffle_id: u32` | — | Transition raffle to `DRAWING` state, emit `DrawTriggered` |
| **`receive_randomness`** | `raffle_id: u32, seed: BytesN<32>, proof: BytesN<64>` | — | Accept oracle-provided randomness, finalize raffle |
| **`cancel_raffle`** | `raffle_id: u32` | — | Cancel raffle and allow refunds |
| **`refund_ticket`** | `raffle_id: u32, ticket_id: u32` | — | Refund a single ticket (only if cancelled) |

**Source:** [`sdk/src/contract/bindings.ts`](../../sdk/src/contract/bindings.ts)

#### Query Methods (Read-Only, No Signing)

| Method | Parameters | Returns | Role |
|--------|-----------|---------|------|
| **`get_raffle_data`** | `raffle_id: u32` | `RaffleData` | Fetch raffle state, params, and status |
| **`get_active_raffle_ids`** | — | `Vec<u32>` | List raffle IDs in `OPEN` or `DRAWING` state |
| **`get_all_raffle_ids`** | — | `Vec<u32>` | List all raffle IDs (all states) |
| **`get_user_tickets`** | `raffle_id: u32, user: Address` | `Vec<u32>` | Get ticket IDs owned by a user in a raffle |
| **`get_user_participation`** | `user: Address` | `UserParticipation` | Get user's participation summary across raffles |

#### Admin Methods (Require Authorization)

| Method | Parameters | Returns | Signer |
|--------|-----------|---------|--------|
| **`set_oracle_address`** | `oracle: Address` | — | Admin only |
| **`set_protocol_fee`** | `fee_bps: u32` | — | Admin only |
| **`withdraw_fees`** | `recipient: Address` | — | Admin only |
| **`pause`** | — | — | Admin only |
| **`unpause`** | — | — | Admin only |
| **`transfer_admin`** | `new_admin: Address` | — | Current admin only |
| **`accept_admin`** | — | — | Pending admin only |
| **`get_admin`** | — | `Address` | Any (read-only) |
| **`is_paused`** | — | `bool` | Any (read-only) |

---

## Data Schemas

### Raffle States

All raffles exist in one of four states:

```rust
enum RaffleStatus {
  Open = 0,      // Accepting ticket purchases
  Drawing = 1,   // Waiting for oracle randomness
  Finalized = 2, // Winner selected, prizes claimable
  Cancelled = 3, // No longer accepting tickets, refunds allowed
}
```

**State Transitions:**

```
OPEN  ──(end_time passed)──▶  DRAWING  ──(oracle reveals)──▶  FINALIZED
  │                                                               ▲
  └───────(host cancels / min not met)────▶  CANCELLED ──────────┘
```

**Allowed Actions per State:**

| State | Allowed | Blocked |
|-------|---------|---------|
| `OPEN` | `buy_ticket` / `trigger_draw` / `cancel_raffle` | `receive_randomness` |
| `DRAWING` | `receive_randomness` / `cancel_raffle` | `buy_ticket` |
| `FINALIZED` | `get_raffle_data` | `buy_ticket` / `cancel_raffle` / `trigger_draw` |
| `CANCELLED` | `refund_ticket` | all others |

### RaffleData Struct

```rust
pub struct RaffleData {
    pub id: u32,
    pub creator: Address,
    pub status: RaffleStatus,
    pub params: RaffleParams,
    pub ticket_count: u32,
    pub total_raised: i128,
    pub winner: Option<Address>,
    pub winning_ticket_id: Option<u32>,
    pub prize_amount: i128,
    pub created_ledger: u32,
    pub end_time: u64,
    pub metadata_uri: String,
}
```

### RaffleParams Struct

```rust
pub struct RaffleParams {
    pub name: String,
    pub description: String,
    pub ticket_price: i128,        // In stroops (1 XLM = 10,000,000 stroops)
    pub min_tickets_sold: u32,
    pub max_tickets: u32,
    pub end_time: u64,             // Ledger timestamp (Unix seconds)
    pub token_address: Address,    // SEP-41 token (usually native XLM)
    pub metadata_uri: String,      // IPFS or HTTP URL to raffle metadata
}
```

### UserParticipation Struct

```rust
pub struct UserParticipation {
    pub user: Address,
    pub raffle_ids: Vec<u32>,
    pub total_spent: i128,
    pub tickets_owned: u32,
    pub raffles_won: u32,
}
```

---

## Contract Events

Events are emitted on the Stellar ledger and indexed by the `tikka-indexer`. Event names and field names must match exactly for parsing to work.

### RaffleCreated

Emitted when a new raffle is created.

```rust
RaffleCreated {
    raffle_id: u32,
    creator: Address,
    ticket_price: i128,
    max_tickets: u32,
    end_time: u64,
}
```

**Indexed by:** `raffle.created` event handler  
**Parsed to:** Database `raffles` table  
**Used by:** Frontend to display new raffles

### TicketPurchased

Emitted when one or more tickets are purchased.

```rust
TicketPurchased {
    raffle_id: u32,
    buyer: Address,
    ticket_ids: Vec<u32>,
    total_paid: i128,
}
```

**Indexed by:** `ticket.purchased` event handler  
**Parsed to:** Database `tickets` and `raffle_metrics` tables  
**Used by:** Backend to track sales, update raffle status

### DrawTriggered

Emitted when the raffle is transitioned to `DRAWING` state.

```rust
DrawTriggered {
    raffle_id: u32,
    triggered_at_ledger: u32,
}
```

**Indexed by:** `raffle.draw_triggered` event handler  
**Parsed to:** Database `raffles` table (status → DRAWING)  
**Used by:** Oracle to detect which raffles need randomness

### RandomnessRequested

Emitted when the contract requests randomness from the oracle.

```rust
RandomnessRequested {
    raffle_id: u32,
    request_id: u32,
}
```

**Indexed by:** Oracle event listener  
**Parsed to:** Oracle worker queue  
**Used by:** Oracle to compute randomness and callback

### RandomnessReceived

Emitted when randomness is successfully received and verified.

```rust
RandomnessReceived {
    raffle_id: u32,
    seed: BytesN<32>,
    proof: BytesN<64>,
}
```

**Indexed by:** `raffle.randomness_received` event handler  
**Parsed to:** Database `raffles` table (randomness verified)  
**Used by:** Frontend to detect raffle finalization

### RaffleFinalized

Emitted when a winner is selected and raffle moves to `FINALIZED` state.

```rust
RaffleFinalized {
    raffle_id: u32,
    winner: Address,
    winning_ticket_id: u32,
    prize_amount: i128,
}
```

**Indexed by:** `raffle.finalized` event handler  
**Parsed to:** Database `raffles` table, send winner notification  
**Used by:** Backend to notify winner, frontend to display results

### RaffleCancelled

Emitted when a raffle is cancelled and moved to `CANCELLED` state.

```rust
RaffleCancelled {
    raffle_id: u32,
    reason: String,
}
```

**Indexed by:** `raffle.cancelled` event handler  
**Parsed to:** Database `raffles` table (status → CANCELLED)  
**Used by:** Frontend to display cancellation, backend to notify participants

### TicketRefunded

Emitted when a ticket is refunded (after cancellation).

```rust
TicketRefunded {
    raffle_id: u32,
    ticket_id: u32,
    recipient: Address,
    amount: i128,
}
```

**Indexed by:** `ticket.refunded` event handler  
**Parsed to:** Database `transactions` table  
**Used by:** Frontend to show refund status

---

## Network Configuration

### Stellar Networks

Tikka supports three Stellar networks:

| Network | RPC Endpoint | Horizon | Use Case |
|---------|--------------|---------|----------|
| **Testnet** | `https://soroban-testnet.stellar.org` | `https://horizon-testnet.stellar.org` | Development, QA, smoke tests |
| **Mainnet** | `https://soroban-mainnet.stellar.org` | `https://horizon.stellar.org` | Production, real users, real transactions |
| **Standalone** | `http://localhost:8000` | `http://localhost:8000` | Local development, integration tests |

**Source:** [`sdk/src/network/network.config.ts`](../../sdk/src/network/network.config.ts)

### Network Passphrase

Each network has a unique passphrase used for transaction signing:

| Network | Passphrase |
|---------|-----------|
| **Testnet** | `Test SDF Network ; September 2015` |
| **Mainnet** | `Public Global Stellar Network ; September 2015` |
| **Standalone** | `Standalone Network ; February 2021` |

**Critical:** Must match contract's network. Using wrong passphrase → invalid signatures.

---

## Integration Points

This section links the contract to specific code locations that depend on it.

### SDK Bindings

**Location:** [`sdk/src/contract/bindings.ts`](../../sdk/src/contract/bindings.ts)

- Defines `ContractFn` enum (all method names)
- Defines `ContractFnName` type for type-safe method calls
- Defines `RaffleStatus` enum (matches contract states)
- Auto-generated from contract ABI via `stellar contract bindings typescript`

**On Contract Update:**
- Regenerate bindings with:
  ```bash
  stellar contract bindings typescript \
    --network testnet \
    --contract-id <NEW_CONTRACT_ID> \
    --output-dir ./sdk/src/contract/generated
  ```

### SDK Contract Service

**Location:** [`sdk/src/contract/contract.service.ts`](../../sdk/src/contract/contract.service.ts)

- Invokes contract methods via `simulateReadOnly()` and `invoke()`
- Handles fee estimation, auth, and XDR serialization
- Returns typed `ContractResponse<T>`

**On Contract Update:**
- Update `ContractFn` calls if method names changed
- Adjust parameter types if `RaffleParams` or other structs changed

### Indexer Event Parser

**Location:** [`indexer/src/ingestor/event-handler-registry.service.ts`](../../indexer/src/ingestor/event-handler-registry.service.ts)  
**Handlers:** [`indexer/src/ingestor/handlers/`](../../indexer/src/ingestor/handlers/)

- Registers handlers for each contract event type
- Each handler implements `IEventHandler` and parses `RawSorobanEvent` to typed domain events
- Persists parsed events to PostgreSQL

**Event Handlers:**
- `RaffleCreatedHandler` → parses `RaffleCreated` event
- `TicketPurchasedHandler` → parses `TicketPurchased` event
- `DrawTriggeredHandler` → parses `DrawTriggered` event
- `RaffleFinalized` → parses `RaffleFinalized` event
- (More in `handlers/index.ts`)

**On Contract Update:**
- If event fields change, update the corresponding handler's `parse()` method
- If new events added, create new handler class and register in registry
- See [`indexer/EVENT_PARSER_EXTENSIBILITY.md`](../../indexer/EVENT_PARSER_EXTENSIBILITY.md)

### Oracle Event Listener

**Location:** [`oracle/src/listener/event-listener.ts`](../../oracle/src/listener/)

- Subscribes to `RandomnessRequested` events
- Queues raffle IDs for randomness computation

**On Contract Update:**
- If `RandomnessRequested` event signature changes, update listener
- If oracle callback method name changes (currently `receive_randomness`), update `TxSubmitter`

### Backend Contract Integration

**Location:** [`backend/src/contract/`](../../backend/src/contract/)

- Metadata storage (raffle name, description, image URL)
- Tracks on-chain state without redundancy
- Mirrors indexer data for API queries

**On Contract Update:**
- Check if contract events include new fields that should be in `raffle_metadata` table
- Update database schema if new fields needed

### Client Contract Integration

**Location:** [`client/src/config/contract.ts`](../../client/src/config/contract.ts)  
**Hooks:** [`client/src/hooks/useContract.ts`](../../client/src/hooks/useContract.ts)

- Stores contract address and method names
- `useContract()` hook wraps SDK calls
- Displays contract state in UI (status, ticket count, prize, etc.)

**On Contract Update:**
- Update method names in `CONTRACT_CONFIG.functions`
- Update `RaffleStatus` enum if states changed
- Update UI to reflect new contract capabilities

---

## Compatibility Verification

Before deploying a contract upgrade, verify compatibility across all packages.

### Pre-Deployment Checklist

See **[CONTRACT_UPGRADE_CHECKLIST.md](./CONTRACT_UPGRADE_CHECKLIST.md)** for the full list.

**Quick Check:**

```bash
# 1. Generate new SDK bindings
cd sdk
stellar contract bindings typescript --network testnet --contract-id <NEW_ID>

# 2. Update constants
# Edit sdk/src/contract/constants.ts with new contract ID

# 3. Run SDK tests
npm run test

# 4. Check indexer event parser still compiles
cd ../indexer
npm run lint

# 5. Verify oracle can call new receive_randomness method
cd ../oracle
npm run lint

# 6. Check backend can fetch contract data
cd ../backend
npm run lint

# 7. Update client contract config
cd ../client
npm run build
```

If all pass, contract upgrade is safe.

---

## Troubleshooting

### Contract Not Found

**Error:** `Raffle contract address not configured for network "testnet"`

**Fix:**
1. Check `TIKKA_CONTRACT_TESTNET` env var is set
2. Verify contract is deployed on the network
3. Check contract ID is valid (matches Soroban ledger)

### Method Not Found

**Error:** `Method "create_raffle_v2" not found on contract`

**Fix:**
1. Contract method name may have changed
2. Check contract source for correct method name
3. Regenerate SDK bindings
4. Update all code referencing old method name

### Event Parse Failure

**Error:** `Failed to parse RaffleCreated: missing data`

**Fix:**
1. Check event field names in contract `events.rs`
2. Update indexer event handler with new field order
3. Re-run indexer from contract deployment block

### State Transition Invalid

**Error:** `Cannot buy ticket on raffle in FINALIZED state`

**Fix:**
1. Check raffle status in contract — may be cached
2. Call `get_raffle_data(raffle_id)` to refresh state
3. Verify event was indexed correctly (check indexer logs)

---

## Related Documentation

- **[CONTRACT_UPGRADE_CHECKLIST.md](./CONTRACT_UPGRADE_CHECKLIST.md)** — Step-by-step upgrade guide
- **[SCHEMA_VERIFICATION.md](./SCHEMA_VERIFICATION.md)** — How to verify contract data compatibility
- **[ARCHITECTURE.md](../ARCHITECTURE.md)** — System-wide architecture (section 1: tikka-contracts)
- **[EVENT_PARSER_EXTENSIBILITY.md](../../indexer/EVENT_PARSER_EXTENSIBILITY.md)** — How indexer parses events
- **[SDK README](../../sdk/README.md)** — SDK usage guide
- **[Stellar Soroban Docs](https://developers.stellar.org/learn/smart-contracts)** — Official Soroban reference

---

## FAQ

**Q: Can I deploy a new contract without updating the SDK?**  
**A:** Only if method names and signatures don't change. If they do, you must regenerate bindings and update all call sites.

**Q: What happens if event field names change?**  
**A:** The indexer event parser will fail to extract the field. Events won't be indexed. Update the handler immediately.

**Q: Can I add a new method to the contract?**  
**A:** Yes, as long as you don't change existing method signatures. Add the new method name to `ContractFn` in the SDK and call sites.

**Q: Do I need to update the Oracle when the contract changes?**  
**A:** Only if the `receive_randomness` method signature changes, or if randomness request/response events change.

**Q: How often do contract deployments happen?**  
**A:** Typically after major feature work or bug fixes. Announced in `CHANGELOG.md` and pinned in Discord.

