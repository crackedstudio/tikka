# Backup and Restore Plan for Postgres and Redis-backed State

This directory contains comprehensive backup and restore procedures for Tikka services that rely on Postgres and Redis state.

## Quick Start

**First time here?** Start with the appropriate guide for your situation:

- **🚀 [Setup automated backups](./BACKUP_PROCEDURES.md#automated-backup-scheduling)** — Schedule daily/weekly backups
- **💾 [Backup now](./BACKUP_PROCEDURES.md#service-specific-backup-procedures)** — Create an immediate backup
- **🔄 [Restore from backup](./RESTORE_PROCEDURES.md)** — Recover lost or corrupted data
- **✅ [Validate after restore](./VALIDATION_CHECKLIST.md)** — Verify restore success
- **🚨 [Incident response](./OPERATIONAL_RUNBOOK.md)** — Handle service outages and emergencies

## Documentation Overview

| Document | Purpose | Audience |
|-----------|---------|----------|
| **[BACKUP_PROCEDURES.md](./BACKUP_PROCEDURES.md)** | Detailed backup methods, service-specific scripts, automation setup | DevOps, SRE, On-Call Engineers |
| **[RESTORE_PROCEDURES.md](./RESTORE_PROCEDURES.md)** | Step-by-step restore for different failure scenarios | DevOps, SRE, On-Call Engineers |
| **[VALIDATION_CHECKLIST.md](./VALIDATION_CHECKLIST.md)** | Post-restore validation and health checks | QA, On-Call Engineers |
| **[OPERATIONAL_RUNBOOK.md](./OPERATIONAL_RUNBOOK.md)** | Common issues, decision trees, incident response | On-Call Engineers, Tech Leads |
| **[tikka-backup.sh](./tikka-backup.sh)** | Automated backup script (executable) | DevOps Automation |
| **[tikka-restore.sh](./tikka-restore.sh)** | Automated restore script (executable) | DevOps Automation |
| **[backup.env.template](./backup.env.template)** | Configuration template for backup scripts | DevOps Setup |

---

## Scope

Includes:
- `backend` metadata and Supabase/Postgres-backed state
- `indexer` Postgres event state and Redis cache
- `oracle` Redis job queue and audit/job state
- `backend` / `indexer` Redis caches

Not included:
- Soroban contract state on Stellar (chain-native, not stored here)
- Client build artifacts
- Docs and repository source files

## Data classification

### Authoritative data

- `backend` metadata stored in Supabase/Postgres
- `indexer` indexed blockchain state stored in Postgres
- `indexer` cursor progress stored in Postgres
- `oracle` processed randomness results or audit records if persisted outside Redis

### Derived / replayable data

- `indexer` can rebuild its state from Horizon / Stellar contract events if the database is lost, assuming an event cursor or ledger range is known.
- `oracle` can re-derive pending randomness work from contract `RandomnessRequested` events if job queue state is lost and the contract remains unresolved.
- `backend` metadata that is also present onchain (raffle parameters, ticket counts) can be rehydrated from contracts and indexer data, but user-specific metadata and notification state may not be recoverable.

### Cache-only data

- Redis caches in `backend` and `indexer` are cache-aside and can be flushed without data loss.
- Oracle Bull queue state in Redis is durable for processing but is not the single source of truth; the contract and event history are authoritative.

## Package backup needs

### `backend`

Primary state:
- Supabase/Postgres tables that store auth, metadata, notifications, and server-managed state.
- Example env: `SUPABASE_DB_URL`

Cache state:
- Redis metadata cache behind `REDIS_URL`
- Cache TTL controlled by `METADATA_CACHE_TTL_SECONDS`

Backup guidance:
- Back up Supabase/Postgres regularly using snapshot or logical export.
- Redis is optional for local dev and can be rebuilt by cache warming after restore.

### `indexer`

Primary state:
- Postgres tables holding decoded blockchain events, raffles, tickets, users, cursor progress, and historical aggregates.
- Example env: `DATABASE_URL`

Cache state:
- Optional Redis cache behind `REDIS_URL`
- Used for query performance, not authoritative state.

Backup guidance:
- Postgres dumps or physical snapshots are required for full recovery.
- Redis persistence is useful for faster restart, but a cache rebuild is acceptable.

### `oracle`

Primary state:
- Oracle audit or job history if persisted outside the Redis queue.
- Contract randomness results are ultimately stored onchain.

Queue state:
- Bull queue data stored in Redis.
- Jobs may be retried or recovered from event history if the queue is lost.

Backup guidance:
- Redis persistence for Bull queues is recommended for minimal failover.
- If the queue is lost, rebuild pending work from unresolved onchain randomness requests.

## Restore order and replay strategy

1. Restore authoritative Postgres state first.
   - `backend` Supabase/Postgres metadata
   - `indexer` Postgres event state + cursor tables
2. Start the indexer in read-only or replay mode if the database was rebuilt from scratch.
3. Restore Redis data next if using persistence.
4. Start `backend`, `indexer`, and `oracle` services after database restore.
5. Rebuild caches and replay data flows.

### Restore sequence

1. Restore `backend` metadata database.
2. Restore `indexer` event database.
3. Restore Redis persistence for `backend`, `indexer`, and `oracle` if available.
4. Start `indexer` and verify cursor position and entity state.
5. Start `backend` and verify API metadata.
6. Start `oracle` and verify queue processing.

### Replay strategy

- If `indexer` Postgres state is lost:
  - Recreate schema and import from a known good dump.
  - Alternatively, replay from the chain using Horizon event ingestion from the earliest required ledger.
  - Ensure the indexer cursor table is reset or aligned with the replay start ledger.
- If `oracle` queue state is lost:
  - Identify unresolved contract randomness requests onchain.
  - Re-enqueue missing work from contract events or indexer-derived request status.
- If Redis cache state is lost:
  - Flush the cache and allow it to warm from normal request traffic.
  - Use `backend` and `indexer` caches only for performance, not recovery.

## Snapshot export/import

### Postgres export

Logical backup:
```bash
pg_dump -Fc --file=tikka-backup.dump "$DATABASE_URL"
```

Restore from dump:
```bash
pg_restore --clean --no-owner --dbname="$DATABASE_URL" tikka-backup.dump
```

Physical backup:
```bash
pg_basebackup -D /var/lib/postgresql/data -F tar -z -P -X stream -h pg-host -U postgres
```

### Redis export

Create an RDB snapshot:
```bash
redis-cli -h $REDIS_HOST -p $REDIS_PORT BGSAVE
redis-cli -h $REDIS_HOST -p $REDIS_PORT --rdb /tmp/redis-dump.rdb
```

Restore from RDB:
1. Stop Redis.
2. Replace `dump.rdb` in the Redis data directory.
3. Start Redis.

If persistent AOF is enabled:
```bash
redis-cli -h $REDIS_HOST -p $REDIS_PORT BGREWRITEAOF
```

## Validation after restore

### `backend`

- Verify Supabase/Postgres connectivity.
- Confirm key metadata queries succeed: `/health`, raffle metadata, and auth status.
- Check no cache-miss storms are causing errors.

### `indexer`

- Verify indexer cursor progress and latest ledger reconciliation.
- Confirm decoded event counts against chain history for a sample raffle.
- Validate queries return expected `raffles`, `tickets`, and `users`.

### `oracle`

- Confirm Redis queue is healthy and jobs are processing.
- Verify unresolved randomness requests are being handled.
- Check Oracle logs for errors, retries, or duplicate work.

### Redis

- Confirm cache keys are present and TTLs are correct after warmup.
- Ensure queue metrics are stable for `bull:*` namespaces.

## Post-restore notes

- Treat Redis caches as transient: a full cache restore is helpful, but not required.
- If the indexer DB was rebuilt from chain, allow it to fully catch up before trusting derived query data.
- Document any restore deviations and update this runbook if the recovery path changes.

---

## Where to Start

### If You Want to...

**Set up automated backups:**
1. Copy `backup.env.template` to `~/.config/tikka/backup.env`
2. Update environment variables with your database URLs
3. Read [BACKUP_PROCEDURES.md](./BACKUP_PROCEDURES.md#automated-backup-scheduling)
4. Add cron jobs or Kubernetes CronJobs

**Create a backup now:**
```bash
# Setup
cp backup.env.template backup.env
source backup.env

# Backup all services
./tikka-backup.sh full

# Or specific service
./tikka-backup.sh backend --compress

# See all options
./tikka-backup.sh --help
```

**Restore from a backup:**
```bash
# Setup (same as above)
source backup.env

# List available backups
./tikka-restore.sh list

# Restore all services from timestamp
./tikka-restore.sh 20240530_023000

# Restore specific service
./tikka-restore.sh 20240530_023000 --service backend

# Dry-run to preview
./tikka-restore.sh 20240530_023000 --dry-run --verbose
```

**Handle an incident:**
1. Refer to [OPERATIONAL_RUNBOOK.md](./OPERATIONAL_RUNBOOK.md)
2. Find your scenario in the runbook
3. Follow the decision tree and action items
4. Report results to your on-call lead

**Validate after restore:**
1. Follow [VALIDATION_CHECKLIST.md](./VALIDATION_CHECKLIST.md)
2. Run each verification in order
3. Document any failures
4. Escalate if any critical checks fail

---

## Key Concepts

### Data Classification

| Classification | Examples | Recovery Strategy |
|---|---|---|
| **Authoritative** | Backend metadata, indexer events, cursor position | **Must backup** — restore from dump |
| **Derived/Replayable** | Indexed events, oracle jobs | Can rebuild from chain using Horizon API |
| **Cache-only** | Redis metadata cache, Bull queue | Transient — can be lost and rebuilt |

### Restore Priority

1. **Postgres databases** (both backend and indexer) — Restore first
2. **Redis persistence** — Restore if available; not critical
3. **Start services** — Indexer → Backend → Oracle
4. **Rebuild caches** — Automatic during service operation

### RPO/RTO Summary

| Scenario | RPO | RTO | Document |
|----------|-----|-----|----------|
| **Full backup** | 7 days | 2-3 hours | RESTORE_PROCEDURES.md#full-platform-restore |
| **Service backup** | 24 hours | 45 min - 1 hour | RESTORE_PROCEDURES.md#service-specific-restore |
| **Cache loss** | 6 hours | 15 min + warmup | RESTORE_PROCEDURES.md |
| **Point-in-time** | Minutes | 1-2 hours | RESTORE_PROCEDURES.md#point-in-time-recovery |

---

## File Sizes & Storage

Typical backup sizes:

- **Backend Postgres dump**: 100MB - 500MB
- **Indexer Postgres dump**: 1GB - 5GB (depending on event history)
- **Redis RDB files**: 10MB - 500MB (depends on cache size)
- **Full platform backup**: 1.5GB - 6GB

**Storage recommendation**: Keep 30 days of backups = ~45GB - 180GB local storage

---

## Support & Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| "Connection refused" on database | See [OPERATIONAL_RUNBOOK.md#backend-service-unreachable](./OPERATIONAL_RUNBOOK.md#1-backend-service-unreachable) |
| Indexer lag too high | See [OPERATIONAL_RUNBOOK.md#indexer-falling-behind](./OPERATIONAL_RUNBOOK.md#2-indexer-falling-behind-high-lag) |
| Redis out of memory | See [OPERATIONAL_RUNBOOK.md#redis-oom](./OPERATIONAL_RUNBOOK.md#4-redis-out-of-memory) |
| Oracle queue stuck | See [OPERATIONAL_RUNBOOK.md#oracle-jobs-stuck](./OPERATIONAL_RUNBOOK.md#5-oracle-queue-jobs-stuck-or-not-processing) |
| Restore fails | See [RESTORE_PROCEDURES.md#troubleshooting](./RESTORE_PROCEDURES.md#troubleshooting-restore-issues) |

### Get Help

1. **Check** [OPERATIONAL_RUNBOOK.md](./OPERATIONAL_RUNBOOK.md) for your scenario
2. **Search** logs using `docker logs <service> | grep -i error`
3. **Verify** database connectivity: `psql "$BACKEND_DB_URL" -c "SELECT 1;"`
4. **Contact** on-call engineer if unable to resolve

---

## Related Documentation

- [Architecture Overview](../ARCHITECTURE.md) — System design and data flow
- [Backend README](../../backend/README.md) — Backend service details
- [Indexer README](../../indexer/README.md) — Indexer service details
- [Oracle README](../../oracle/README.md) — Oracle service details

---

## Maintenance & Updates

This runbook should be updated when:
- Database schema changes
- Services are added or removed
- New backup/restore methods are introduced
- Incidents reveal missing procedures

**Last updated:** See git history  
**Version:** 1.0  
**Status:** Operational
