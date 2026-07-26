# Entity Ownership & Field Documentation

This document describes the ownership model for all indexer database entities, distinguishing between **raw chain state** (source-of-truth from Stellar ledger events) and **derived query state** (computed aggregates maintained by processors).

---

## Table of Contents

- [Raffle Entity](#raffle-entity)
- [Ticket Entity](#ticket-entity)
- [User Entity](#user-entity)
- [RaffleEvent Entity](#raffleevent-entity)
- [PlatformStat Entity](#platformstat-entity)
- [IndexerCursor Entity](#indexercursor-entity)
- [DeadLetterEvent Entity (DLQ)](#deadletterevent-entity-dlq)
- [Recalculation Safety](#recalculation-safety)

---

## Raffle Entity

**File**: `raffle.entity.ts`  
**Table**: `raffles`  
**Purpose**: Represents a single raffle as tracked by the indexer.

### Field Ownership

| Field | Type | Ownership | Updater | Safe to Recalculate? |
|-------|------|-----------|---------|---------------------|
| `id` | `number` | **Raw chain state** | `RaffleCreated` event | ❌ No — natural PK from contract |
| `creator` | `string` | **Raw chain state** | `RaffleCreated` event | ❌ No — immutable after creation |
| `status` | `RaffleStatus` | **Raw chain state** | `RaffleCreated`, `RaffleFinalized`, `RaffleCancelled` events | ❌ No — reflects contract state machine |
| `ticketPrice` | `string` | **Raw chain state** | `RaffleCreated` event | ❌ No — immutable after creation |
| `asset` | `string` | **Raw chain state** | `RaffleCreated` event | ❌ No — immutable after creation |
| `maxTickets` | `number` | **Raw chain state** | `RaffleCreated` event | ❌ No — immutable after creation |
| `ticketsSold` | `number` | **Derived** | `TicketProcessor.handleTicketPurchased()` | ✅ Yes — `COUNT(tickets WHERE raffle_id = X)` |
| `endTime` | `string` | **Raw chain state** | `RaffleCreated` event | ❌ No — immutable after creation |
| `winner` | `string \| null` | **Raw chain state** | `RaffleFinalized` event | ❌ No — determined by contract VRF |
| `winningTicketId` | `number \| null` | **Raw chain state** | `RaffleFinalized` event | ❌ No — determined by contract VRF |
| `prizeAmount` | `string \| null` | **Raw chain state** | `RaffleFinalized` event | ❌ No — determined by contract |
| `createdLedger` | `number` | **Raw chain state** | `RaffleCreated` event | ❌ No — immutable after creation |
| `finalizedLedger` | `number \| null` | **Raw chain state** | `RaffleFinalized`, `RaffleCancelled` events | ❌ No — immutable after finalization |
| `metadataCid` | `string \| null` | **Raw chain state** | `RaffleCreated` event | ❌ No — immutable after creation |
| `createdAt` | `Date` | **Derived** | TypeORM `@CreateDateColumn` | ⚠️ Caution — indexer timestamp, not chain time |

### Updater Handlers

- **`RaffleProcessor.handleRaffleCreated()`**: Inserts the raffle row with all immutable fields.
- **`RaffleProcessor.handleRaffleFinalized()`**: Updates `status`, `winner`, `winningTicketId`, `prizeAmount`, `finalizedLedger`.
- **`RaffleProcessor.handleRaffleCancelled()`**: Updates `status` to `CANCELLED`, sets `finalizedLedger`.
- **`TicketProcessor.handleTicketPurchased()`**: Increments `ticketsSold` atomically.

### Idempotency

- All writes are keyed on `txHash` in the `raffle_events` audit table.
- Raffle row inserts use `orIgnore()` on the natural PK (`id`).
- Status updates are conditional (`WHERE status != :newStatus`) to prevent replays from overwriting state.

---

## Ticket Entity

**File**: `ticket.entity.ts`  
**Table**: `tickets`  
**Purpose**: Represents a single raffle ticket purchased by a user.

### Field Ownership

| Field | Type | Ownership | Updater | Safe to Recalculate? |
|-------|------|-----------|---------|---------------------|
| `id` | `number` | **Raw chain state** | `TicketPurchased` event | ❌ No — natural PK from contract |
| `raffleId` | `number` | **Raw chain state** | `TicketPurchased` event | ❌ No — immutable after creation |
| `owner` | `string` | **Raw chain state** | `TicketPurchased` event | ❌ No — immutable after creation |
| `purchasedAtLedger` | `number` | **Raw chain state** | `TicketPurchased` event | ❌ No — immutable after creation |
| `purchaseTxHash` | `string` | **Raw chain state** | `TicketPurchased` event | ❌ No — idempotency key |
| `refunded` | `boolean` | **Raw chain state** | `TicketRefunded` event | ❌ No — reflects contract refund state |
| `refundTxHash` | `string \| null` | **Raw chain state** | `TicketRefunded` event | ❌ No — immutable after refund |

### Updater Handlers

- **`TicketProcessor.handleTicketPurchased()`**: Inserts ticket rows idempotently (`orIgnore()` on PK).
- **`TicketProcessor.handleTicketRefunded()`**: Updates `refunded` to `true`, sets `refundTxHash`.

### Idempotency

- `purchaseTxHash` has a unique constraint — replaying the same transaction is a no-op.
- Refund updates are conditional (`WHERE id = :ticketId AND raffle_id = :raffleId`).

---

## User Entity

**File**: `user.entity.ts`  
**Table**: `users`  
**Purpose**: Aggregated per-user participation statistics.

### Field Ownership

| Field | Type | Ownership | Updater | Safe to Recalculate? |
|-------|------|-----------|---------|---------------------|
| `address` | `string` | **Raw chain state** | First event involving this address | ❌ No — natural PK |
| `totalTicketsBought` | `number` | **Derived** | `UserProcessor.handleTicketPurchased()` | ✅ Yes — `COUNT(tickets WHERE owner = X)` |
| `totalRafflesEntered` | `number` | **Derived** | `UserProcessor.handleTicketPurchased()` | ✅ Yes — `COUNT(DISTINCT raffle_id FROM tickets WHERE owner = X)` |
| `totalRafflesWon` | `number` | **Derived** | `UserProcessor.handleRaffleFinalized()` | ✅ Yes — `COUNT(raffles WHERE winner = X)` |
| `totalPrizeXlm` | `string` | **Derived** | `UserProcessor.handleRaffleFinalized()` | ✅ Yes — `SUM(prize_amount FROM raffles WHERE winner = X)` |
| `firstSeenLedger` | `number` | **Raw chain state** | First event involving this address | ⚠️ Caution — `MIN(ledger)` from all events |
| `lastTxHash` | `string \| null` | **Derived** | All user processors | ⚠️ Caution — idempotency key, not recalculable |
| `updatedAt` | `Date` | **Derived** | TypeORM `@UpdateDateColumn` | ⚠️ Caution — indexer timestamp |

### Updater Handlers

- **`UserProcessor.handleTicketPurchased()`**: Increments `totalTicketsBought` by ticket count, increments `totalRafflesEntered` if first ticket in raffle.
- **`UserProcessor.handleRaffleFinalized()`**: Increments `totalRafflesWon` by 1, adds `prizeAmount` to `totalPrizeXlm`.
- **`UserProcessor.handleRaffleCreated()`**: Ensures creator has a user row, updates `firstSeenLedger`.

### Idempotency

- `lastTxHash` acts as an idempotency key — processors skip updates if `lastTxHash` matches the incoming `txHash`.
- All increments are atomic SQL operations (`total_tickets_bought + N`).

### Recalculation Notes

All derived fields can be safely recalculated from the `tickets` and `raffles` tables:

```sql
-- Recalculate user stats
UPDATE users u SET
  total_tickets_bought = (SELECT COUNT(*) FROM tickets WHERE owner = u.address),
  total_raffles_entered = (SELECT COUNT(DISTINCT raffle_id) FROM tickets WHERE owner = u.address),
  total_raffles_won = (SELECT COUNT(*) FROM raffles WHERE winner = u.address),
  total_prize_xlm = COALESCE((SELECT SUM(prize_amount::numeric) FROM raffles WHERE winner = u.address)::text, '0');
```

⚠️ **Warning**: Recalculation will reset `lastTxHash`, breaking idempotency. Only recalculate during maintenance windows or after verifying no concurrent event processing.

---

## RaffleEvent Entity

**File**: `raffle-event.entity.ts`  
**Table**: `raffle_events`  
**Purpose**: Raw log of every Tikka contract event ingested from the Stellar ledger. Acts as an audit trail and is the **source of truth** for all processors.

### Field Ownership

| Field | Type | Ownership | Updater | Safe to Recalculate? |
|-------|------|-----------|---------|---------------------|
| `id` | `string` (UUID) | **Derived** | TypeORM `@PrimaryGeneratedColumn` | ❌ No — synthetic PK |
| `raffleId` | `number` | **Raw chain state** | Event payload | ❌ No — immutable after creation |
| `eventType` | `string` | **Raw chain state** | Event payload | ❌ No — immutable after creation |
| `schemaVersion` | `number` | **Raw chain state** | Event payload | ❌ No — immutable after creation |
| `ledger` | `number` | **Raw chain state** | Event payload | ❌ No — immutable after creation |
| `txHash` | `string` | **Raw chain state** | Event payload | ❌ No — idempotency key |
| `payloadJson` | `Record<string, unknown>` | **Raw chain state** | Event payload | ❌ No — immutable after creation |
| `indexedAt` | `Date` | **Derived** | TypeORM `@CreateDateColumn` | ⚠️ Caution — indexer timestamp |

### Updater Handlers

- **All processors**: Insert events idempotently via `orIgnore()` on the unique `txHash` constraint.

### Idempotency

- `txHash` has a unique constraint — replaying the same transaction is a no-op.
- This table is **append-only** — no updates or deletes (except archiving).

### Archiving

Old events can be safely archived and deleted after a retention period (default: 30 days). See `src/maintenance/ARCHIVE_RAFFLE_EVENTS_GUIDE.md` for details.

---

## PlatformStat Entity

**File**: `platform-stat.entity.ts`  
**Table**: `platform_stats`  
**Purpose**: Daily platform-wide aggregate statistics.

### Field Ownership

| Field | Type | Ownership | Updater | Safe to Recalculate? |
|-------|------|-----------|---------|---------------------|
| `date` | `string` (date) | **Derived** | Stats cron job | ❌ No — natural PK for daily roll-ups |
| `totalRaffles` | `number` | **Derived** | Stats cron job | ✅ Yes — `COUNT(raffles WHERE DATE(created_at) = X)` |
| `totalTickets` | `number` | **Derived** | Stats cron job | ✅ Yes — `COUNT(tickets WHERE DATE(indexed_at) = X)` |
| `totalVolumeXlm` | `string` | **Derived** | Stats cron job | ✅ Yes — `SUM(ticket_price * tickets_sold)` for date |
| `uniqueParticipants` | `number` | **Derived** | Stats cron job | ✅ Yes — `COUNT(DISTINCT owner FROM tickets WHERE DATE(indexed_at) = X)` |
| `prizesDistributedXlm` | `string` | **Derived** | Stats cron job | ✅ Yes — `SUM(prize_amount FROM raffles WHERE DATE(finalized_at) = X)` |

### Updater Handlers

- **Stats cron job** (not yet implemented in provided code): Runs daily to compute aggregates from `raffles` and `tickets` tables.

### Recalculation Notes

All fields can be safely recalculated from the `raffles` and `tickets` tables. This table is a **materialized view** for query performance.

---

## IndexerCursor Entity

**File**: `indexer-cursor.entity.ts`  
**Table**: `indexer_cursor`  
**Purpose**: Singleton row tracking the last processed ledger and reorg detection state.

### Field Ownership

| Field | Type | Ownership | Updater | Safe to Recalculate? |
|-------|------|-----------|---------|---------------------|
| `id` | `number` | **Derived** | Singleton PK (always 1) | ❌ No — singleton PK |
| `lastLedger` | `number` | **Derived** | Ingestor after processing each ledger | ⚠️ Caution — reset only during reindexing |
| `lastPagingToken` | `string` | **Derived** | Ingestor after processing each ledger | ⚠️ Caution — reset only during reindexing |
| `ledgerHashes` | `Array<{ledger, hash}>` | **Derived** | Ingestor (ring buffer for reorg detection) | ⚠️ Caution — reset only during reindexing |
| `updatedAt` | `Date` | **Derived** | TypeORM `@UpdateDateColumn` | ⚠️ Caution — indexer timestamp |

### Updater Handlers

- **`CursorManagerService`** (in `ingestor/` module): Updates after each ledger is processed.

### Recalculation Notes

❌ **Do not recalculate** — this table tracks ingestion progress. Resetting it will cause the indexer to reprocess ledgers from the beginning.

To reset the cursor (e.g., for a full reindex):

```sql
UPDATE indexer_cursor SET last_ledger = 0, last_paging_token = '', ledger_hashes = '[]' WHERE id = 1;
```

---

## DeadLetterEvent Entity (DLQ)

**File**: `dead-letter-event.entity.ts`  
**Table**: `dead_letter_events`  
**Purpose**: Stores events that failed to process, with retry and replay support.

### Field Ownership

| Field | Type | Ownership | Updater | Safe to Recalculate? |
|-------|------|-----------|---------|---------------------|
| `id` | `string` (UUID) | **Derived** | TypeORM `@PrimaryGeneratedColumn` | ❌ No — synthetic PK |
| `ledger` | `number` | **Raw chain state** | Failed event payload | ❌ No — immutable after creation |
| `contractId` | `string \| null` | **Raw chain state** | Failed event payload | ❌ No — immutable after creation |
| `eventType` | `string` | **Raw chain state** | Failed event payload | ❌ No — immutable after creation |
| `rawPayload` | `Record<string, unknown>` | **Raw chain state** | Failed event payload | ❌ No — immutable after creation |
| `errorMessage` | `string` | **Derived** | Exception handler | ❌ No — diagnostic info |
| `reason` | `DlqReason` | **Derived** | Exception handler | ❌ No — diagnostic info |
| `retryable` | `boolean` | **Derived** | Exception handler | ⚠️ Caution — can be manually updated |
| `retryCount` | `number` | **Derived** | Replay handler | ⚠️ Caution — incremented on each retry |
| `replayedAt` | `Date \| null` | **Derived** | Replay handler | ⚠️ Caution — idempotency guard |
| `createdAt` | `Date` | **Derived** | TypeORM `@CreateDateColumn` | ❌ No — diagnostic timestamp |
| `lastAttemptAt` | `Date` | **Derived** | TypeORM `@UpdateDateColumn` | ❌ No — diagnostic timestamp |

### Updater Handlers

- **Exception handlers** (in processors): Insert failed events into DLQ.
- **Replay handler** (not yet implemented in provided code): Retries events, increments `retryCount`, sets `replayedAt`.

### Recalculation Notes

❌ **Do not recalculate** — this table is an operational log. Entries should be replayed or manually resolved, not recalculated.

---

## Recalculation Safety

### Safe to Recalculate (Derived Aggregates)

These fields can be safely recomputed from raw chain state:

- **`RaffleEntity.ticketsSold`**: `COUNT(tickets WHERE raffle_id = X)`
- **`UserEntity.totalTicketsBought`**: `COUNT(tickets WHERE owner = X)`
- **`UserEntity.totalRafflesEntered`**: `COUNT(DISTINCT raffle_id FROM tickets WHERE owner = X)`
- **`UserEntity.totalRafflesWon`**: `COUNT(raffles WHERE winner = X)`
- **`UserEntity.totalPrizeXlm`**: `SUM(prize_amount FROM raffles WHERE winner = X)`
- **All `PlatformStatEntity` fields**: Aggregate queries over `raffles` and `tickets`

### Unsafe to Recalculate (Raw Chain State)

These fields are the **source of truth** from the Stellar ledger and must never be recomputed:

- All fields in `RaffleEntity` except `ticketsSold` and `createdAt`
- All fields in `TicketEntity`
- All fields in `RaffleEventEntity` except `indexedAt`
- `UserEntity.address`, `UserEntity.firstSeenLedger`

### Idempotency Keys

These fields are used for idempotency and should not be recalculated without careful consideration:

- `RaffleEventEntity.txHash`
- `TicketEntity.purchaseTxHash`
- `UserEntity.lastTxHash`
- `DeadLetterEventEntity.replayedAt`

⚠️ **Warning**: Recalculating idempotency keys will break replay protection. Only reset during maintenance windows with no concurrent event processing.

---

## Migration Ownership Rules

When creating new migrations, follow these rules:

1. **Raw chain state fields**: Must be populated from event payloads. Never use `DEFAULT` values except for nullable fields.
2. **Derived fields**: Can use `DEFAULT 0` or computed defaults. Must have a corresponding updater handler.
3. **Idempotency keys**: Must have unique constraints or conditional update logic.
4. **Timestamps**: Use `@CreateDateColumn` and `@UpdateDateColumn` for indexer timestamps. Never use them as source-of-truth for chain time.

### Example Migration Pattern

```typescript
// ✅ Good: Raw chain state with no default
@Column({ type: 'integer', name: 'created_ledger' })
createdLedger!: number;

// ✅ Good: Derived field with default
@Column({ type: 'integer', default: 0, name: 'tickets_sold' })
ticketsSold!: number;

// ❌ Bad: Raw chain state with default
@Column({ type: 'integer', default: 0, name: 'created_ledger' })
createdLedger!: number;
```

---

## References

- **Indexer README**: `indexer/README.md`
- **Architecture**: `docs/ARCHITECTURE.md` § Data Model
- **Processors**: `indexer/src/processors/`
- **Archiving**: `indexer/src/maintenance/ARCHIVE_RAFFLE_EVENTS_GUIDE.md`
