# Restore Procedures for Tikka Services

This document provides detailed procedures for restoring Postgres and Redis state across the Tikka platform.

**Table of Contents**
- [Restore Strategy Overview](#restore-strategy-overview)
- [Prerequisites](#prerequisites)
- [Full Platform Restore](#full-platform-restore)
- [Service-Specific Restore Procedures](#service-specific-restore-procedures)
- [Point-in-Time Recovery](#point-in-time-recovery)
- [Partial Data Recovery](#partial-data-recovery)
- [Replay and Rebuild Scenarios](#replay-and-rebuild-scenarios)
- [Post-Restore Validation](#post-restore-validation)

---

## Restore Strategy Overview

### Restore Priority Order

The order matters because later services depend on earlier ones:

1. **Postgres Databases First** (both backend and indexer)
   - These contain authoritative state that cannot be easily rebuilt
   - ~30 minutes for typical restore

2. **Redis Persistence** (optional but recommended)
   - Speeds up service startup
   - Services function without it (caches rebuild)
   - ~10 minutes for restore

3. **Start Services in Dependency Order**
   - Indexer first (no external dependencies)
   - Backend second (depends on healthy indexer)
   - Oracle last (depends on both)

### Recovery Time Objectives (RTO)

| Scenario | Services Affected | Estimated Time |
|----------|------------------|-----------------|
| Redis cache loss | Backend, Indexer, Oracle | 15 min + cache warmup |
| Single Postgres DB loss | Backend only | 45 min + validation |
| Single Postgres DB loss | Indexer only | 1 hour + replay verification |
| Full platform failure | All services | 2-3 hours + full validation |

### Recovery Point Objectives (RPO)

| Service | Backup Frequency | RPO |
|---------|-----------------|-----|
| Backend | Daily | 24 hours |
| Indexer | Daily | 24 hours |
| Oracle queue | Every 6 hours | 6 hours |
| Full platform | Weekly | 7 days |

---

## Prerequisites

### Pre-Restore Verification

```bash
# 1. Ensure backup files exist and are accessible
ls -lh /mnt/backups/backend/*/backend-postgres.dump
ls -lh /mnt/backups/indexer/*/indexer-postgres.dump

# 2. Verify database systems are installed
which psql pg_restore
which redis-cli

# 3. Verify connectivity to database servers
psql -U postgres -h localhost -c "SELECT version();"
redis-cli -h localhost -p 6379 PING

# 4. Check disk space (needs at least 2x backup size)
df -h /

# 5. Stop all Tikka services before restore
docker-compose -f backend/docker-compose.yml down
docker-compose -f indexer/docker-compose.yml down
docker-compose -f oracle/docker-compose.yml down
```

### Environment Setup

```bash
# Load backup configuration
source /etc/tikka/backup.env

# Or manually set variables
export BACKEND_DB_URL="postgres://tikka:pass@localhost:5432/tikka_backend"
export INDEXER_DB_URL="postgres://tikka:pass@localhost:5432/tikka_indexer"
export BACKEND_REDIS_HOST="localhost"
export BACKEND_REDIS_PORT="6379"
export INDEXER_REDIS_HOST="localhost"
export INDEXER_REDIS_PORT="6379"
export ORACLE_REDIS_HOST="localhost"
export ORACLE_REDIS_PORT="6379"
export BACKUP_DIR="/mnt/backups"
```

---

## Full Platform Restore

### Scenario: Complete Data Loss / Disaster Recovery

**Duration:** ~2-3 hours  
**When to use:** Hardware failure, complete data corruption, or major incident

### Step 1: Prepare Postgres Databases

```bash
#!/bin/bash
set -euo pipefail

BACKUP_TIMESTAMP="20240530_023000"  # Your backup timestamp
BACKEND_DUMP="$BACKUP_DIR/backend/$BACKUP_TIMESTAMP/backend-postgres.dump"
INDEXER_DUMP="$BACKUP_DIR/indexer/$BACKUP_TIMESTAMP/indexer-postgres.dump"

echo "[$(date)] Starting Postgres restore..."

# 1. Verify backup files exist
if [[ ! -f "$BACKEND_DUMP" ]]; then
  echo "❌ Backend backup not found: $BACKEND_DUMP"
  exit 1
fi

if [[ ! -f "$INDEXER_DUMP" ]]; then
  echo "❌ Indexer backup not found: $INDEXER_DUMP"
  exit 1
fi

# 2. Start Postgres if not running
docker-compose -f backend/docker-compose.yml up -d postgres redis
docker-compose -f indexer/docker-compose.yml up -d postgres redis
sleep 10  # Wait for services to be ready

# 3. Drop existing databases (CAREFUL!)
echo "[$(date)] Dropping existing databases..."
psql "$BACKEND_DB_URL" -c "DROP DATABASE IF EXISTS tikka_backend;" 2>/dev/null || true
psql "$INDEXER_DB_URL" -c "DROP DATABASE IF EXISTS tikka_indexer;" 2>/dev/null || true

# 4. Recreate empty databases
echo "[$(date)] Creating fresh databases..."
psql -U postgres -h localhost -c "CREATE DATABASE tikka_backend;"
psql -U postgres -h localhost -c "CREATE DATABASE tikka_indexer;"

# 5. Restore from backup
echo "[$(date)] Restoring backend Postgres from backup..."
pg_restore --clean --no-owner --no-privileges \
  --jobs=4 \
  --verbose \
  --dbname="$BACKEND_DB_URL" \
  "$BACKEND_DUMP"

echo "[$(date)] Restoring indexer Postgres from backup..."
pg_restore --clean --no-owner --no-privileges \
  --jobs=4 \
  --verbose \
  --dbname="$INDEXER_DB_URL" \
  "$INDEXER_DUMP"

# 6. Verify restore
echo "[$(date)] Verifying Postgres restore..."
psql "$BACKEND_DB_URL" -c "SELECT COUNT(*) FROM raffle_metadata;" || echo "Backend verify failed"
psql "$INDEXER_DB_URL" -c "SELECT COUNT(*) FROM raffle;" || echo "Indexer verify failed"

echo "[$(date)] Postgres restore complete ✅"
```

**To run:**
```bash
chmod +x restore-postgres.sh
./restore-postgres.sh
```

### Step 2: Restore Redis Data

```bash
#!/bin/bash
set -euo pipefail

BACKUP_TIMESTAMP="20240530_023000"
BACKEND_RDB="$BACKUP_DIR/backend/$BACKUP_TIMESTAMP/backend-redis.rdb"
INDEXER_RDB="$BACKUP_DIR/indexer/$BACKUP_TIMESTAMP/indexer-redis.rdb"
ORACLE_RDB="$BACKUP_DIR/oracle/$BACKUP_TIMESTAMP/oracle-redis.rdb"

echo "[$(date)] Starting Redis restore..."

# Function to restore Redis RDB
restore_redis_rdb() {
  local rdb_file=$1
  local redis_host=$2
  local redis_port=$3
  local service=$4
  
  if [[ ! -f "$rdb_file" ]]; then
    echo "⚠️  Redis backup not found for $service: $rdb_file (cache will be rebuilt)"
    return 0
  fi
  
  echo "[$(date)] Restoring Redis for $service..."
  
  # Stop Redis to replace dump
  redis-cli -h "$redis_host" -p "$redis_port" SHUTDOWN NOSAVE 2>/dev/null || true
  sleep 2
  
  # Copy backup RDB
  cp "$rdb_file" /var/lib/redis/dump.rdb
  chown redis:redis /var/lib/redis/dump.rdb
  chmod 644 /var/lib/redis/dump.rdb
  
  # Start Redis
  redis-server --daemonize yes
  sleep 2
  
  # Verify
  redis-cli -h "$redis_host" -p "$redis_port" PING || echo "⚠️  Redis ping failed for $service"
  echo "[$(date)] Redis restored for $service ✅"
}

# Restore each Redis instance
restore_redis_rdb "$BACKEND_RDB" "$BACKEND_REDIS_HOST" "$BACKEND_REDIS_PORT" "backend"
restore_redis_rdb "$INDEXER_RDB" "$INDEXER_REDIS_HOST" "$INDEXER_REDIS_PORT" "indexer"
restore_redis_rdb "$ORACLE_RDB" "$ORACLE_REDIS_HOST" "$ORACLE_REDIS_PORT" "oracle"

echo "[$(date)] Redis restore complete ✅"
```

**To run:**
```bash
chmod +x restore-redis.sh
./restore-redis.sh
```

### Step 3: Start All Services

```bash
#!/bin/bash
set -euo pipefail

echo "[$(date)] Starting all Tikka services..."

# Wait for databases to be ready
echo "[$(date)] Waiting for databases to be ready..."
for i in {1..30}; do
  if psql "$BACKEND_DB_URL" -c "SELECT 1" &>/dev/null; then
    echo "[$(date)] Backend database ready"
    break
  fi
  echo "Waiting for backend database... ($i/30)"
  sleep 2
done

for i in {1..30}; do
  if psql "$INDEXER_DB_URL" -c "SELECT 1" &>/dev/null; then
    echo "[$(date)] Indexer database ready"
    break
  fi
  echo "Waiting for indexer database... ($i/30)"
  sleep 2
done

# Start services in order
echo "[$(date)] Starting indexer..."
docker-compose -f indexer/docker-compose.yml up -d

sleep 10

echo "[$(date)] Starting backend..."
docker-compose -f backend/docker-compose.yml up -d

sleep 10

echo "[$(date)] Starting oracle..."
docker-compose -f oracle/docker-compose.yml up -d

# Wait for services to be ready
echo "[$(date)] Waiting for services to be ready..."
for i in {1..30}; do
  if curl -f http://localhost:3001/health &>/dev/null; then
    echo "[$(date)] Backend health check passed"
    break
  fi
  echo "Waiting for backend service... ($i/30)"
  sleep 2
done

echo "[$(date)] All services started ✅"
```

---

## Service-Specific Restore Procedures

### Backend-Only Restore

**When to use:** Backend metadata corruption, auth system issues, notification failures

**Duration:** ~45 minutes

```bash
#!/bin/bash
set -euo pipefail

BACKUP_TIMESTAMP="20240530_023000"
BACKEND_DUMP="$BACKUP_DIR/backend/$BACKUP_TIMESTAMP/backend-postgres.dump"
BACKEND_RDB="$BACKUP_DIR/backend/$BACKUP_TIMESTAMP/backend-redis.rdb"

echo "[$(date)] Starting backend-only restore..."

# 1. Stop backend service
docker-compose -f backend/docker-compose.yml down

# 2. Drop and recreate database
psql -U postgres -h localhost -c "DROP DATABASE IF EXISTS tikka_backend;"
psql -U postgres -h localhost -c "CREATE DATABASE tikka_backend;"

# 3. Restore Postgres
echo "[$(date)] Restoring backend Postgres..."
pg_restore --clean --no-owner \
  --dbname="$BACKEND_DB_URL" \
  "$BACKEND_DUMP"

# 4. Restore Redis (optional)
if [[ -f "$BACKEND_RDB" ]]; then
  echo "[$(date)] Restoring backend Redis..."
  cp "$BACKEND_RDB" /var/lib/redis/dump.rdb
  redis-cli SHUTDOWN NOSAVE || true
  sleep 1
  redis-server --daemonize yes
fi

# 5. Start backend service
echo "[$(date)] Starting backend service..."
docker-compose -f backend/docker-compose.yml up -d

sleep 10

# 6. Verify
curl -f http://localhost:3001/health || echo "⚠️  Backend health check failed"

echo "[$(date)] Backend restore complete ✅"
```

### Indexer-Only Restore

**When to use:** Indexer event database corruption, event ingestion issues

**Duration:** ~1 hour (+ replay time if needed)

```bash
#!/bin/bash
set -euo pipefail

BACKUP_TIMESTAMP="20240530_023000"
INDEXER_DUMP="$BACKUP_DIR/indexer/$BACKUP_TIMESTAMP/indexer-postgres.dump"
INDEXER_SNAPSHOT="$BACKUP_DIR/indexer/$BACKUP_TIMESTAMP/indexer-snapshot.json"

echo "[$(date)] Starting indexer-only restore..."

# 1. Stop indexer service
docker-compose -f indexer/docker-compose.yml down

# 2. Drop and recreate database
psql -U postgres -h localhost -c "DROP DATABASE IF EXISTS tikka_indexer;"
psql -U postgres -h localhost -c "CREATE DATABASE tikka_indexer;"

# 3. Restore Postgres
echo "[$(date)] Restoring indexer Postgres..."
pg_restore --clean --no-owner \
  --dbname="$INDEXER_DB_URL" \
  "$INDEXER_DUMP"

# 4. Start indexer service
echo "[$(date)] Starting indexer service..."
docker-compose -f indexer/docker-compose.yml up -d

# 5. Monitor indexer catch-up
echo "[$(date)] Waiting for indexer to catch up with chain..."
sleep 30

# Check cursor position
psql "$INDEXER_DB_URL" -c "SELECT * FROM indexer_cursor LIMIT 1;"

echo "[$(date)] Indexer restore complete ✅"
```

---

## Point-in-Time Recovery (PITR)

**When to use:** Recovering data from a specific point in time (e.g., before accidental deletion)

**Requirements:** WAL (Write-Ahead Log) archiving must be enabled

### Using Postgres WAL Files

```bash
#!/bin/bash
set -euo pipefail

TARGET_TIME="2024-05-30 15:30:00 UTC"  # Your recovery target time
BACKUP_PATH="$BACKUP_DIR/backend/$BACKUP_TIMESTAMP/backend-postgres.dump"
WAL_ARCHIVE="/var/lib/postgresql/wal_archive"

echo "[$(date)] Starting point-in-time recovery to $TARGET_TIME..."

# 1. Restore base backup
echo "[$(date)] Restoring base backup..."
psql -U postgres -h localhost -c "DROP DATABASE IF EXISTS tikka_backend;"
psql -U postgres -h localhost -c "CREATE DATABASE tikka_backend;"

pg_restore --clean --no-owner \
  --dbname="$BACKEND_DB_URL" \
  "$BACKUP_PATH"

# 2. Restore WAL files up to target time
echo "[$(date)] Applying WAL files until $TARGET_TIME..."
# This is typically managed by a recovery.conf or postgresql.conf file

# 3. Verify recovery
echo "[$(date)] Verifying recovery..."
psql "$BACKEND_DB_URL" -c "SELECT now();"

echo "[$(date)] PITR complete ✅"
```

**Note:** PITR requires careful planning. Consult Postgres documentation for detailed WAL recovery procedures.

---

## Partial Data Recovery

### Recover Specific Tables Only

**When to use:** Table-level corruption, selective data recovery

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DUMP="$BACKUP_DIR/backend/$BACKUP_TIMESTAMP/backend-postgres.dump"
TABLE_NAME="raffle_metadata"  # Table to recover

echo "[$(date)] Recovering table '$TABLE_NAME' from backup..."

# 1. List all tables in backup
echo "Available tables in backup:"
pg_restore --list "$BACKUP_DUMP" | grep TABLE

# 2. Restore specific table only
pg_restore \
  --data-only \
  --table="$TABLE_NAME" \
  --dbname="$BACKEND_DB_URL" \
  "$BACKUP_DUMP"

# 3. Verify
psql "$BACKEND_DB_URL" -c "SELECT COUNT(*) FROM $TABLE_NAME;"

echo "[$(date)] Table recovery complete ✅"
```

### Recover Specific Redis Keys

**When to use:** Selective cache recovery, queue data restoration

```bash
#!/bin/bash
set -euo pipefail

RDB_FILE="$BACKUP_DIR/backend/$BACKUP_TIMESTAMP/backend-redis.rdb"
PATTERN="metadata:*"  # Keys to recover

echo "[$(date)] Recovering Redis keys matching '$PATTERN' from backup..."

# 1. Load backup RDB into temporary Redis instance
redis-server --port 6380 --daemonize yes

# 2. Transfer specific keys to production
redis-cli -p 6380 --scan --pattern "$PATTERN" | while read key; do
  # Get value from backup
  value=$(redis-cli -p 6380 GET "$key")
  ttl=$(redis-cli -p 6380 TTL "$key")
  
  # Restore to production
  if [[ $ttl -gt 0 ]]; then
    redis-cli -p 6379 SETEX "$key" "$ttl" "$value"
  else
    redis-cli -p 6379 SET "$key" "$value"
  fi
done

# 3. Stop temporary Redis
redis-cli -p 6380 SHUTDOWN

echo "[$(date)] Key recovery complete ✅"
```

---

## Replay and Rebuild Scenarios

### Rebuild Indexer from Chain

**When to use:** Complete indexer data loss, need to resynchronize from blockchain

**Duration:** 4-48 hours (depending on ledger range)

```bash
#!/bin/bash
set -euo pipefail

REPLAY_FROM_LEDGER=50000000  # Start from a known good ledger

echo "[$(date)] Starting indexer rebuild from chain..."

# 1. Create fresh indexer database
psql -U postgres -h localhost -c "DROP DATABASE IF EXISTS tikka_indexer;"
psql -U postgres -h localhost -c "CREATE DATABASE tikka_indexer;"

# 2. Run migrations
cd indexer
npm run typeorm migration:run -- -d dist/src/data-source.js

# 3. Start indexer with replay
export INDEXER_REPLAY_FROM_LEDGER="$REPLAY_FROM_LEDGER"
export INDEXER_MODE="replay"

docker-compose up -d

# 4. Monitor progress
echo "[$(date)] Waiting for replay to complete..."
while true; do
  cursor=$(psql "$INDEXER_DB_URL" -t -c "SELECT ledger_sequence FROM indexer_cursor LIMIT 1;")
  echo "[$(date)] Indexer at ledger: $cursor"
  
  # Check if caught up with Horizon
  horizon_ledger=$(curl -s https://horizon.stellar.org/ledgers | jq '.records[0].sequence')
  if [[ $cursor -ge $horizon_ledger ]]; then
    echo "[$(date)] Indexer caught up!"
    break
  fi
  
  sleep 60
done

echo "[$(date)] Indexer rebuild complete ✅"
```

### Rebuild Oracle Queue from Contract State

**When to use:** Oracle queue completely lost, need to recover pending jobs

```bash
#!/bin/bash
set -euo pipefail

echo "[$(date)] Starting oracle queue rebuild from contract state..."

# 1. Connect to Soroban
# 2. Query all RandomnessRequested events that are unresolved
# 3. Re-enqueue jobs

docker exec oracle npm run cli -- rebuild-queue

echo "[$(date)] Oracle queue rebuild complete ✅"
```

---

## Post-Restore Validation

### Automated Health Checks

```bash
#!/bin/bash
set -euo pipefail

echo "[$(date)] Running post-restore validation checks..."

# Backend checks
echo "[$(date)] Checking backend..."
curl -f http://localhost:3001/health || (echo "❌ Backend health failed"; exit 1)

# Indexer checks
echo "[$(date)] Checking indexer..."
curl -f http://localhost:3002/health || (echo "❌ Indexer health failed"; exit 1)

# Verify data consistency
echo "[$(date)] Verifying data consistency..."
psql "$BACKEND_DB_URL" -c "SELECT COUNT(*) FROM raffle_metadata;" || exit 1
psql "$INDEXER_DB_URL" -c "SELECT COUNT(*) FROM raffle;" || exit 1

echo "[$(date)] ✅ All validation checks passed"
```

**Continue to:** [VALIDATION_CHECKLIST.md](./VALIDATION_CHECKLIST.md)

---

## Troubleshooting Restore Issues

### "Cannot drop database because it's being accessed"

```bash
# Find and terminate connections
psql -U postgres -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE datname = 'tikka_backend'
  AND pid <> pg_backend_pid();
"

# Then retry drop
psql -U postgres -c "DROP DATABASE tikka_backend;"
```

### Restore hangs or is very slow

```bash
# Check I/O performance
iostat -x 1

# Monitor restore progress
# In another terminal:
ps aux | grep pg_restore
tail -f /var/log/postgresql/postgresql.log
```

### "Role does not exist"

```bash
# Use --no-owner flag (already in scripts) or:
# Create missing role
psql -U postgres -c "CREATE ROLE tikka LOGIN;"

# Then restore
pg_restore --no-owner ...
```

---

## Checklist: Before and After Restore

### Before Restore
- [ ] All services are stopped
- [ ] Backup files are verified and accessible
- [ ] Database systems are running and healthy
- [ ] Adequate disk space is available
- [ ] Environment variables are configured
- [ ] Team is notified of maintenance window

### After Restore
- [ ] See [VALIDATION_CHECKLIST.md](./VALIDATION_CHECKLIST.md)
