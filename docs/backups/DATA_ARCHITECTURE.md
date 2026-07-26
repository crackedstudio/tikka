# Data Architecture & Backup Strategy

This document explains the data architecture of Tikka and how it informs our backup and restore strategy.

**Table of Contents**
- [System Overview](#system-overview)
- [Data Stores](#data-stores)
- [Data Dependencies](#data-dependencies)
- [Recovery Scenarios](#recovery-scenarios)
- [Authoritative vs. Derived Data](#authoritative-vs-derived-data)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Stellar Blockchain (Chain-Native, Not Backed Up)           │
│  ├─ Soroban Contracts (Raffle, Randomness, Governance)    │
│  ├─ Contract State (Raffle params, winners, results)      │
│  └─ Events (RandomnessRequested, RaffleCreated, etc.)     │
└────────────┬────────────────────────────────────────────────┘
             │ Horizon API
             ▼
┌─────────────────────────────────────────────────────────────┐
│  Tikka Indexer (Postgres + Redis)                          │
│  ├─ Events Table (decoded blockchain events)              │
│  ├─ Raffles Table (contract state mirror)                 │
│  ├─ Tickets Table (user participation)                    │
│  ├─ Users Table (participant tracking)                    │
│  ├─ Cursor Table (event ingestion progress)               │
│  └─ Redis Cache (query performance)                       │
│     Backup: Required (authoritative event history)        │
└────────────┬────────────────────────────────────────────────┘
             │ REST API (GraphQL planned)
             ▼
┌─────────────────────────────────────────────────────────────┐
│  Tikka Backend (Postgres/Supabase + Redis)                 │
│  ├─ Raffle Metadata (title, description, images)          │
│  ├─ User Profiles (preferences, notifications)            │
│  ├─ Auth State (nonce, tokens, sessions)                  │
│  ├─ Notifications (alerts, email subscriptions)           │
│  └─ Redis Cache (metadata cache for performance)          │
│     Backup: Required (authoritative metadata)             │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
        Client App


┌─────────────────────────────────────────────────────────────┐
│  Tikka Oracle (Redis)                                       │
│  ├─ Bull Queue (pending randomness jobs)                   │
│  ├─ Job State (processing, completed, failed)             │
│  └─ Audit/Metrics (optional persistence)                  │
│     Backup: Helpful (queue can be rebuilt from events)    │
└────────────┬────────────────────────────────────────────────┘
             │ Soroban RPC
             ▼
    Stellar Blockchain
    (Results written to contract)
```

---

## Data Stores

### 1. Backend Postgres (Supabase)

**Purpose:** Metadata and user-specific state

**Tables:**
- `raffle_metadata` — Title, description, images, categories
- `users` — User profiles, preferences
- `notifications` — Email/push notification subscriptions
- `auth_nonce` — Temporary nonces for SIWS
- `refresh_tokens` — Session tokens (may be in Supabase Auth)

**Authoritative:** ✅ YES
- Not stored on blockchain
- No way to rebuild without backup
- User-specific data (preferences, email addresses)

**Backup Strategy:**
- **Frequency:** Daily (or on-demand)
- **Method:** `pg_dump` logical backup
- **Retention:** 30+ days (regulatory may require longer)
- **Location:** Local + Cloud (S3, GCS, etc.)

**Loss Impact:**
- **Severe:** Can't serve raffle metadata, auth breaks
- **Recovery Time:** 30-45 minutes with backup
- **Recovery Without Backup:** Possible to seed from contracts + manual re-entry

---

### 2. Indexer Postgres

**Purpose:** Blockchain event state and derived data

**Tables:**
- `raffle` — Raffle state (name, creator, status, winners)
- `raffle_event` — All events emitted by raffle contract
- `ticket` — Participant tickets (amounts, holders)
- `user` — Participant identities and stats
- `indexer_cursor` — Ingestion progress (critical!)
- `platform_stat` — Aggregated metrics

**Authoritative:** ✅ YES (for events and cursor)
- Decoded blockchain events
- Cursor position needed to resume indexing

**Replayable:** ✅ PARTIAL
- Events can be re-indexed from Horizon
- Cursor must be preserved to avoid re-processing
- Aggregated stats are derived from events

**Backup Strategy:**
- **Frequency:** Daily (or after indexer fully catches up)
- **Method:** `pg_dump` or `pg_basebackup`
- **Retention:** 30+ days (full event history retention depends on business needs)
- **Snapshots:** Also export snapshot of current state for faster restoration

**Loss Impact:**
- **Severe:** Can't serve raffle list, data goes stale
- **Recovery Time:** 1-24 hours (depends on ledger range to replay)
- **Recovery Without Backup:** Replay events from Horizon (4-48 hours depending on ledger range)

**Critical Table: `indexer_cursor`**
```sql
SELECT * FROM indexer_cursor;
-- ledger_sequence: 50000000 (current ingestion point)
-- ledger_hash: abcd... (for verification)
-- last_update: 2024-05-30 10:23:45
```

If cursor is lost, indexer must replay from last known ledger, which can take hours.

---

### 3. Backend Redis (Cache)

**Purpose:** Performance optimization for frequent queries

**Keys (examples):**
- `metadata:raffle:1` — Raffle metadata cache
- `metadata:user:address` — User profile cache
- `leaderboard:*` — Leaderboard aggregates
- `session:*` — Temporary session data
- Cache TTL: Seconds to hours (configurable)

**Authoritative:** ❌ NO
- Pure cache, can be flushed anytime
- Data exists in Postgres

**Backup Strategy:**
- **Frequency:** Optional (helpful but not critical)
- **Method:** Redis RDB snapshot or AOF
- **Retention:** Latest only (or 7 days for recovery)
- **Recovery:** Not critical; cache will warm from traffic

**Loss Impact:**
- **Minor:** API slower until cache warms (5-10 minutes)
- **Recovery Time:** Automatic (cache rebuilds on first miss)
- **Recovery Without Backup:** Not needed; cache is transient

---

### 4. Indexer Redis (Cache)

**Purpose:** Query performance for frequent indexer operations

**Keys (examples):**
- `raffle:*` — Raffle state cache
- `ticket:*` — Ticket lookups
- Cache TTL: Seconds (shorter due to frequent updates)

**Authoritative:** ❌ NO
- Pure cache, Postgres is source of truth

**Backup Strategy:**
- **Frequency:** Optional
- **Method:** Redis RDB
- **Retention:** Latest only
- **Recovery:** Not critical

**Loss Impact:**
- **Minor:** Indexer queries slower temporarily
- **Recovery Time:** Automatic
- **Recovery Without Backup:** Not needed

---

### 5. Oracle Redis (Bull Queue)

**Purpose:** Job queue for randomness processing

**Keys (examples):**
- `bull:randomness-queue:*` — Job queue for pending randomness
- `bull:randomness-queue:active` — Currently processing jobs
- `bull:randomness-queue:completed` — Completed jobs (history)
- `bull:randomness-queue:failed` — Failed jobs (retry candidates)

**Job Lifecycle:**
```
RandomnessRequested Event
  ↓ (enqueue)
Bull Queue (pending)
  ↓ (worker picks up)
Bull Active Queue
  ↓ (compute & submit)
Contract (result written)
  ↓ (mark complete)
Bull Completed Queue (history)
```

**Authoritative:** ❌ NO
- Queue data is durable but transient
- Jobs can be re-created from unresolved contract events

**Replayable:** ✅ YES
- Scan Soroban contract for `RandomnessRequested` events that are unresolved
- Re-enqueue missing jobs
- Re-submit already-completed results (idempotent)

**Backup Strategy:**
- **Frequency:** Every 6 hours (or continuous persistence)
- **Method:** Redis RDB snapshot or AOF
- **Retention:** Latest only (or 24 hours)
- **Recovery:** Can replay from contract if backup lost

**Loss Impact:**
- **Moderate:** Randomness processing stalls until queue rebuilt
- **Recovery Time:** 10-30 minutes (includes rebuild from contract)
- **Recovery Without Backup:** Query contract for unresolved requests + re-enqueue (15 min)

---

## Data Dependencies

```
Stellar Blockchain
    ↓
    └─→ Horizon API (public data, immutable)
        └─→ Indexer (event ingestion, state derivation)
            ├─→ Events Table (authoritative, backed up)
            ├─→ Raffles Table (derived from events)
            ├─→ Cursor Table (critical for resumption)
            └─→ Redis Cache (performance only)
        
        └─→ Backend Metadata (user content, not on chain)
            ├─→ Raffle Metadata (backed up)
            ├─→ User Profiles (backed up)
            ├─→ Notifications (backed up)
            └─→ Redis Cache (performance only)

Oracle Service
    ├─→ Bull Queue (Redis) ← backed up
    ├─→ Indexer API (for contract state)
    └─→ Soroban RPC (to submit results)
```

---

## Recovery Scenarios

### Scenario 1: Backend Postgres Only Fails

**What's Lost:**
- Raffle metadata (title, description, images)
- User profiles and preferences
- Notification subscriptions
- Auth state (if stored here)

**Recovery:**
1. Restore from Backend Postgres backup (30 min)
2. Verify `/health` endpoint
3. Test raffle metadata API
4. Rebuild metadata cache (automatic)

**Data After Recovery:**
- ✅ Raffle list/details work
- ✅ Auth works
- ❌ Any recent metadata changes (since backup) are lost

---

### Scenario 2: Indexer Postgres Fails

**What's Lost:**
- All indexed blockchain events
- Raffle state derived from events
- Participant lists and ticket counts
- **Critical:** Cursor position (how far we've indexed)

**Recovery Option A: Restore from Backup (Preferred)**
1. Restore from Indexer Postgres backup (30 min)
2. Verify cursor position matches backup timestamp
3. Start indexer — it resumes from cursor position
4. Verify API returns raffle data

**Recovery Option B: Rebuild from Chain (If Backup Missing/Corrupted)**
1. Recreate schema (migrations)
2. Start indexer with `REPLAY_FROM_LEDGER=<known_good_ledger>`
3. Indexer re-ingests from Horizon
4. ETA: 4-48 hours depending on ledger range

**Data After Recovery (Option A):**
- ✅ All events and raffle state
- ⚠️ Missing events since backup (24 hours max)

**Data After Recovery (Option B):**
- ✅ All events from replay ledger onwards
- ⚠️ Events before replay ledger lost (usually acceptable)

---

### Scenario 3: Oracle Queue (Redis) Fails

**What's Lost:**
- All pending randomness jobs in queue
- Job processing status

**Recovery Option A: Restore from Backup (Fastest)**
1. Restore from Oracle Redis backup (5 min)
2. Verify Bull queue keys exist
3. Start oracle — it resumes processing

**Recovery Option B: Rebuild from Contract (If Backup Lost)**
1. Query Soroban for `RandomnessRequested` events
2. Find all unresolved requests
3. Re-enqueue as jobs
4. Start oracle

**Data After Recovery:**
- ✅ All pending jobs restored or rebuilt
- ✅ No randomness requests are lost (they exist on chain)

---

### Scenario 4: Cache (Redis) Fails

**What's Lost:**
- All metadata and query result caches
- Performance optimization

**Recovery:**
1. Cache automatically warms from DB traffic
2. API queries work, just slower temporarily
3. No manual intervention needed

**Data After Recovery:**
- ✅ Everything works, performance gradually improves

---

### Scenario 5: Everything Fails (Disaster Recovery)

**Recovery Order:**
1. **Restore Indexer Postgres** (data is immutable, needed for backend)
2. **Restore Backend Postgres** (user content)
3. **Restore Redis** (optional, caches)
4. **Start Services** in order: Indexer → Backend → Oracle
5. **Verify** all health endpoints

**Total Time:** 2-3 hours for full recovery

---

## Authoritative vs. Derived Data

### Authoritative Data (Must Backup)

| Data | Store | Backup? | Why | Recovery Without Backup |
|------|-------|---------|-----|------------------------|
| Event history | Indexer Postgres | ✅ YES | Not on chain (only emitted, not replayed) | Can replay from Horizon with time cost |
| Cursor position | Indexer Postgres | ✅ YES | Critical for resuming ingestion | Must reset to earliest known ledger |
| Metadata | Backend Postgres | ✅ YES | User-created, not on chain | Manual re-entry required |
| Auth state | Backend Postgres | ✅ YES | Tokens and sessions | Users must re-authenticate |

### Derived Data (Can Rebuild)

| Data | Source | Backup? | Why | Recovery Method |
|------|--------|---------|-----|-----------------|
| Raffle list | Indexer Postgres (events) | ❌ Optional | Can be rebuilt from events | Re-index from Horizon |
| Ticket counts | Indexer Postgres (events) | ❌ Optional | Can be rebuilt from events | Re-index from Horizon |
| User stats | Indexer Postgres (events) | ❌ Optional | Can be rebuilt from events | Re-index from Horizon |
| Query cache | Postgres | ❌ NO | Can be rebuilt from DB | Automatic warmup |
| Job queue | Bull/Soroban | ❌ Optional | Can be rebuilt from contract | Re-scan contract events |

### Cache-Only Data (Never Back Up)

| Data | Store | Why | Recovery |
|------|-------|-----|----------|
| Metadata cache | Redis | Transient, backed by DB | Automatic warmup (5-10 min) |
| Query cache | Redis | Transient, backed by DB | Automatic warmup |
| Session cache | Redis | Temporary, auto-expires | Users just re-login |

---

## Backup Priorities

**Tier 1 (Critical - Back Up Daily):**
- Indexer Postgres (with cursor position)
- Backend Postgres (metadata)

**Tier 2 (Important - Back Up Weekly):**
- Oracle Redis (queue state)
- Full snapshots of both Postgres databases

**Tier 3 (Optional - Not Necessary):**
- Cache Redis instances

---

## Testing Recovery

To ensure backups are usable:

1. **Weekly Test Restore:**
   ```bash
   # Pick a backup from 1 week ago
   ./tikka-restore.sh 20240523_023000 --service backend --dry-run
   
   # Once monthly, do actual restore to test database
   ./tikka-restore.sh 20240523_023000 --service indexer
   # Verify data matches expectations
   ```

2. **Chain Replay Test (Quarterly):**
   ```bash
   # Verify that indexer can replay from chain
   # Start indexer with REPLAY_FROM_LEDGER set to 1 month ago
   # Wait for it to catch up
   # Verify event counts match
   ```

3. **RTO/RPO Validation:**
   - Measure actual restore time for each service
   - Document any deviations from estimates
   - Update runbook if times change

---

## See Also

- [Backup Procedures](./BACKUP_PROCEDURES.md)
- [Restore Procedures](./RESTORE_PROCEDURES.md)
- [Validation Checklist](./VALIDATION_CHECKLIST.md)
- [Architecture Overview](../ARCHITECTURE.md)
