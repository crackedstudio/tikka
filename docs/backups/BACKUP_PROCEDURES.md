# Backup Procedures for Tikka Services

This document provides detailed, executable procedures for backing up all Postgres and Redis state across the Tikka platform.

**Table of Contents**
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Backup Methods](#backup-methods)
- [Service-Specific Backup Procedures](#service-specific-backup-procedures)
- [Automated Backup Scheduling](#automated-backup-scheduling)
- [Backup Verification](#backup-verification)
- [Storage and Retention](#storage-and-retention)

---

## Overview

Tikka relies on three primary data stores:

1. **Backend Postgres** — Supabase/Postgres metadata, auth, notifications
2. **Indexer Postgres** — Blockchain event state, cursor progress, aggregates
3. **Redis (shared)** — Caches and Bull queue state for backend, indexer, and oracle

Each service has different recovery priority:
- **Critical**: Backend and indexer Postgres (authoritative, not easily recoverable)
- **Important**: Redis persistence (helpful but cache-rebuildable)

---

## Prerequisites

### Environment Setup

Ensure the following tools are available on your backup host:

```bash
# Postgres tools
which pg_dump pg_restore
which psql

# Redis tools
which redis-cli

# AWS/Cloud CLI (if uploading backups)
which aws gsutil az

# Compression/archiving
which tar gzip
```

### Required Environment Variables

Create or source a backup configuration file:

```bash
# Backend database
export BACKEND_DB_URL="postgres://user:pass@backend-postgres:5432/tikka_backend"
export BACKEND_REDIS_HOST="backend-redis"
export BACKEND_REDIS_PORT="6379"

# Indexer database
export INDEXER_DB_URL="postgres://user:pass@indexer-postgres:5432/tikka_indexer"
export INDEXER_REDIS_HOST="indexer-redis"
export INDEXER_REDIS_PORT="6379"

# Oracle Redis (shared or dedicated)
export ORACLE_REDIS_HOST="oracle-redis"
export ORACLE_REDIS_PORT="6379"

# Backup destination
export BACKUP_DIR="/mnt/backups"
export S3_BACKUP_BUCKET="s3://my-org-backups/tikka"
export BACKUP_RETENTION_DAYS="30"
```

### Database Access

Verify connectivity to all databases:

```bash
# Test backend database
psql "$BACKEND_DB_URL" -c "SELECT version();"

# Test indexer database
psql "$INDEXER_DB_URL" -c "SELECT version();"

# Test Redis connections
redis-cli -h "$BACKEND_REDIS_HOST" -p "$BACKEND_REDIS_PORT" PING
redis-cli -h "$INDEXER_REDIS_HOST" -p "$INDEXER_REDIS_PORT" PING
redis-cli -h "$ORACLE_REDIS_HOST" -p "$ORACLE_REDIS_PORT" PING
```

---

## Backup Methods

### Postgres Logical Backups (pg_dump)

**Advantages:**
- Portable across versions and OS
- Can restore to subset of databases
- Supports compression
- No downtime required

**Disadvantages:**
- Slower for very large databases
- Higher CPU usage during backup

**Command:**
```bash
pg_dump -Fc --file=backup.dump "$DATABASE_URL"
pg_dump -Fc --jobs=4 --file=backup.dump "$DATABASE_URL"  # parallel
```

### Postgres Physical Backups (pg_basebackup)

**Advantages:**
- Faster than logical backup
- Includes all database data
- Better for point-in-time recovery with WAL

**Disadvantages:**
- Must use same Postgres version for restore
- Larger file size
- Requires WAL archiving setup

**Command:**
```bash
pg_basebackup -D backup/ -F tar -z -h pg-host -U postgres
```

### Redis RDB Snapshot

**Advantages:**
- Single compact file
- Fast to generate
- Good for cold backups

**Disadvantages:**
- Can lose data written between snapshots
- Requires write access to Redis data directory

**Command:**
```bash
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" BGSAVE
# Wait for background save to complete
# Copy dump.rdb to backup location
```

### Redis AOF (Append-Only File)

**Advantages:**
- Near-real-time durability
- Can recover every change

**Disadvantages:**
- Larger file size
- Slower writes during collection
- More complex backup management

**Command:**
```bash
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" BGREWRITEAOF
# Wait for rewrite to complete
# Copy appendonly.aof to backup location
```

---

## Service-Specific Backup Procedures

### Backend Postgres + Redis Backup

**Schedule:** Daily or on-demand  
**RPO:** 24 hours  
**RTO:** 30 minutes

#### Backup Script

```bash
#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/mnt/backups}"
BACKEND_BACKUP_DIR="$BACKUP_DIR/backend/$TIMESTAMP"

mkdir -p "$BACKEND_BACKUP_DIR"

echo "[$(date)] Starting backend backup..."

# 1. Backup Postgres metadata database
echo "[$(date)] Backing up backend Postgres..."
pg_dump -Fc \
  --jobs=4 \
  --file="$BACKEND_BACKUP_DIR/backend-postgres.dump" \
  "$BACKEND_DB_URL"

# 2. Export Redis data
echo "[$(date)] Backing up backend Redis..."
redis-cli -h "$BACKEND_REDIS_HOST" -p "$BACKEND_REDIS_PORT" BGSAVE

# Wait for background save
sleep 2
redis-cli -h "$BACKEND_REDIS_HOST" -p "$BACKEND_REDIS_PORT" LASTSAVE

# Copy Redis RDB to backup
cp /var/lib/redis/dump.rdb "$BACKEND_BACKUP_DIR/backend-redis.rdb" 2>/dev/null || \
  redis-cli -h "$BACKEND_REDIS_HOST" -p "$BACKEND_REDIS_PORT" --rdb "$BACKEND_BACKUP_DIR/backend-redis.rdb"

# 3. Create metadata file
cat > "$BACKEND_BACKUP_DIR/MANIFEST.json" << EOF
{
  "service": "backend",
  "timestamp": "$(date -Iseconds)",
  "backup_type": "full",
  "contains": ["postgres", "redis"],
  "postgres": {
    "file": "backend-postgres.dump",
    "format": "custom",
    "compressed": true
  },
  "redis": {
    "file": "backend-redis.rdb",
    "format": "RDB"
  }
}
EOF

echo "[$(date)] Backend backup complete: $BACKEND_BACKUP_DIR"
```

**To run:**
```bash
chmod +x backup-backend.sh
./backup-backend.sh
```

### Indexer Postgres + Redis + Snapshots Backup

**Schedule:** Daily (or after indexer catch-up)  
**RPO:** 24 hours  
**RTO:** 1 hour

#### Backup Script

```bash
#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/mnt/backups}"
INDEXER_BACKUP_DIR="$BACKUP_DIR/indexer/$TIMESTAMP"

mkdir -p "$INDEXER_BACKUP_DIR"

echo "[$(date)] Starting indexer backup..."

# 1. Backup Postgres event database
echo "[$(date)] Backing up indexer Postgres..."
pg_dump -Fc \
  --jobs=4 \
  --file="$INDEXER_BACKUP_DIR/indexer-postgres.dump" \
  "$INDEXER_DB_URL"

# 2. Export snapshot of current state (if indexer provides export)
echo "[$(date)] Exporting indexer snapshot..."
if command -v indexer-cli &> /dev/null; then
  indexer-cli export-snapshot "$INDEXER_BACKUP_DIR/indexer-snapshot.json"
fi

# 3. Export Redis cache
echo "[$(date)] Backing up indexer Redis..."
redis-cli -h "$INDEXER_REDIS_HOST" -p "$INDEXER_REDIS_PORT" BGSAVE
sleep 2

cp /var/lib/redis/dump.rdb "$INDEXER_BACKUP_DIR/indexer-redis.rdb" 2>/dev/null || \
  redis-cli -h "$INDEXER_REDIS_HOST" -p "$INDEXER_REDIS_PORT" --rdb "$INDEXER_BACKUP_DIR/indexer-redis.rdb"

# 4. Capture cursor state for replay reference
echo "[$(date)] Capturing indexer cursor state..."
psql "$INDEXER_DB_URL" -c "SELECT * FROM indexer_cursor LIMIT 1;" \
  > "$INDEXER_BACKUP_DIR/cursor-state.sql"

# 5. Create metadata file
cat > "$INDEXER_BACKUP_DIR/MANIFEST.json" << EOF
{
  "service": "indexer",
  "timestamp": "$(date -Iseconds)",
  "backup_type": "full",
  "contains": ["postgres", "redis", "snapshot", "cursor"],
  "postgres": {
    "file": "indexer-postgres.dump",
    "format": "custom",
    "compressed": true
  },
  "redis": {
    "file": "indexer-redis.rdb",
    "format": "RDB"
  },
  "snapshot": {
    "file": "indexer-snapshot.json"
  },
  "cursor_state": {
    "file": "cursor-state.sql"
  }
}
EOF

echo "[$(date)] Indexer backup complete: $INDEXER_BACKUP_DIR"
```

**To run:**
```bash
chmod +x backup-indexer.sh
./backup-indexer.sh
```

### Oracle Redis + Queue State Backup

**Schedule:** Every 6 hours (or continuous persistence)  
**RPO:** 6 hours  
**RTO:** 10 minutes

#### Backup Script

```bash
#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/mnt/backups}"
ORACLE_BACKUP_DIR="$BACKUP_DIR/oracle/$TIMESTAMP"

mkdir -p "$ORACLE_BACKUP_DIR"

echo "[$(date)] Starting oracle backup..."

# 1. Export Bull queue state from Redis
echo "[$(date)] Backing up oracle Redis (Bull queue)..."
redis-cli -h "$ORACLE_REDIS_HOST" -p "$ORACLE_REDIS_PORT" BGSAVE
sleep 2

cp /var/lib/redis/dump.rdb "$ORACLE_BACKUP_DIR/oracle-redis.rdb" 2>/dev/null || \
  redis-cli -h "$ORACLE_REDIS_HOST" -p "$ORACLE_REDIS_PORT" --rdb "$ORACLE_BACKUP_DIR/oracle-redis.rdb"

# 2. Export Bull queue data (keys matching bull:*)
echo "[$(date)] Exporting Bull queue keys..."
redis-cli -h "$ORACLE_REDIS_HOST" -p "$ORACLE_REDIS_PORT" \
  --scan --pattern 'bull:*' \
  > "$ORACLE_BACKUP_DIR/bull-queue-keys.txt" || true

# 3. Create metadata file
cat > "$ORACLE_BACKUP_DIR/MANIFEST.json" << EOF
{
  "service": "oracle",
  "timestamp": "$(date -Iseconds)",
  "backup_type": "queue_state",
  "contains": ["redis", "bull_queue"],
  "redis": {
    "file": "oracle-redis.rdb",
    "format": "RDB"
  },
  "queue_keys": {
    "file": "bull-queue-keys.txt"
  }
}
EOF

echo "[$(date)] Oracle backup complete: $ORACLE_BACKUP_DIR"
```

**To run:**
```bash
chmod +x backup-oracle.sh
./backup-oracle.sh
```

### Full Platform Backup (All Services)

**Schedule:** Weekly or after major changes  
**RPO:** 7 days  
**RTO:** 2 hours

#### Combined Backup Script

```bash
#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/mnt/backups}"
FULL_BACKUP_DIR="$BACKUP_DIR/full-platform/$TIMESTAMP"

mkdir -p "$FULL_BACKUP_DIR"

echo "[$(date)] Starting full platform backup..."

# Run all service backups
./backup-backend.sh
./backup-indexer.sh
./backup-oracle.sh

# Create platform-level manifest
cat > "$FULL_BACKUP_DIR/PLATFORM_MANIFEST.json" << EOF
{
  "platform": "tikka",
  "timestamp": "$(date -Iseconds)",
  "backup_scope": "full",
  "services": [
    {
      "name": "backend",
      "backup_dir": "$BACKUP_DIR/backend/$TIMESTAMP"
    },
    {
      "name": "indexer",
      "backup_dir": "$BACKUP_DIR/indexer/$TIMESTAMP"
    },
    {
      "name": "oracle",
      "backup_dir": "$BACKUP_DIR/oracle/$TIMESTAMP"
    }
  ]
}
EOF

echo "[$(date)] Full platform backup complete"
```

---

## Automated Backup Scheduling

### Cron Job Setup

Add to `/etc/cron.d/tikka-backups` (Linux/macOS):

```cron
# Daily backend backup at 2 AM
0 2 * * * backup /path/to/backup-backend.sh >> /var/log/tikka-backups.log 2>&1

# Daily indexer backup at 3 AM
0 3 * * * backup /path/to/backup-indexer.sh >> /var/log/tikka-backups.log 2>&1

# Every 6 hours oracle backup
0 */6 * * * backup /path/to/backup-oracle.sh >> /var/log/tikka-backups.log 2>&1

# Weekly full backup on Sunday at 1 AM
0 1 * * 0 backup /path/to/backup-full-platform.sh >> /var/log/tikka-backups.log 2>&1
```

### Kubernetes CronJob (if running on K8s)

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: tikka-backup-backend
  namespace: tikka
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          serviceAccountName: backup-service
          containers:
          - name: backup
            image: postgres:15-alpine
            command:
            - /bin/sh
            - -c
            - |
              pg_dump -Fc --jobs=4 \
                --file=/backups/backend-$(date +%Y%m%d_%H%M%S).dump \
                "$BACKEND_DB_URL"
            env:
            - name: BACKEND_DB_URL
              valueFrom:
                secretKeyRef:
                  name: backup-secrets
                  key: backend-db-url
            volumeMounts:
            - name: backup-storage
              mountPath: /backups
          volumes:
          - name: backup-storage
            persistentVolumeClaim:
              claimName: backup-pvc
          restartPolicy: OnFailure
```

---

## Backup Verification

### Verify Backup File Integrity

```bash
# Check file size
ls -lh "$BACKUP_DIR/backend/$TIMESTAMP/backend-postgres.dump"

# Verify pg_dump file is readable
pg_restore --list "$BACKUP_DIR/backend/$TIMESTAMP/backend-postgres.dump" | head -20

# Verify Redis RDB file
file "$BACKUP_DIR/backend/$TIMESTAMP/backend-redis.rdb"
strings "$BACKUP_DIR/backend/$TIMESTAMP/backend-redis.rdb" | head -10
```

### Test Restore to Temporary Database

```bash
# Create temporary test database
createdb -U postgres tikka_backend_test

# Restore from backup
pg_restore --clean --no-owner \
  --dbname="postgres://postgres:pass@localhost:5432/tikka_backend_test" \
  "$BACKUP_DIR/backend/$TIMESTAMP/backend-postgres.dump"

# Verify data
psql -d tikka_backend_test -c "SELECT COUNT(*) FROM raffle_metadata;"

# Cleanup
dropdb -U postgres tikka_backend_test
```

### Validate Backup Manifest

```bash
#!/bin/bash

check_backup_manifest() {
  local backup_dir=$1
  local required_files=("MANIFEST.json")
  
  for file in "${required_files[@]}"; do
    if [[ ! -f "$backup_dir/$file" ]]; then
      echo "❌ Missing: $file"
      return 1
    fi
  done
  
  # Validate JSON
  jq . "$backup_dir/MANIFEST.json" > /dev/null 2>&1 || return 1
  
  echo "✅ Manifest valid"
  return 0
}

check_backup_manifest "$BACKUP_DIR/backend/$TIMESTAMP"
```

---

## Storage and Retention

### Local Storage

```bash
# Create backup storage structure
mkdir -p /mnt/backups/{backend,indexer,oracle,full-platform}
chmod 700 /mnt/backups

# Create rotation policy (example: keep last 30 days)
find /mnt/backups -type d -mtime +30 -exec rm -rf {} \;
```

### Cloud Storage (AWS S3)

```bash
#!/bin/bash

upload_backup_to_s3() {
  local backup_dir=$1
  local s3_bucket=${S3_BACKUP_BUCKET:-s3://tikka-backups}
  local service=$(basename $(dirname "$backup_dir"))
  local timestamp=$(basename "$backup_dir")
  
  aws s3 sync "$backup_dir" \
    "$s3_bucket/$service/$timestamp" \
    --sse AES256 \
    --storage-class GLACIER
}

# Usage
upload_backup_to_s3 "/mnt/backups/backend/$TIMESTAMP"
```

### Backup Lifecycle Policy

- **Last 7 days:** Full retention on local storage
- **8-30 days:** Archive to cloud (S3 Standard-IA)
- **31-90 days:** Archive to Glacier
- **90+ days:** Delete (unless regulatory requirement)

---

## Checklist: Before Running Backups

- [ ] All services are running and healthy
- [ ] Database connectivity verified
- [ ] Backup destination has adequate free space (3x database size recommended)
- [ ] Backup scripts have execute permissions
- [ ] Environment variables are set correctly
- [ ] Log files are writable
- [ ] Cloud credentials are configured (if using cloud storage)
- [ ] Monitoring/alerting is configured for backup completion

---

## Troubleshooting Common Backup Issues

### "Connection refused" on Postgres

```bash
# Check if postgres is running
ps aux | grep postgres

# Check port accessibility
nc -zv localhost 5432

# Verify credentials
psql -U tikka -h localhost -d tikka_backend -c "SELECT 1;"
```

### Redis BGSAVE hangs

```bash
# Check Redis memory usage
redis-cli INFO memory

# If memory is near max, eviction might be happening
redis-cli CONFIG GET maxmemory-policy

# Check background save status
redis-cli LASTSAVE
redis-cli INFO stats
```

### Backup file corruption

```bash
# Re-run backup with verbose flag
pg_dump -v -Fc --file=backup.dump "$DATABASE_URL"

# Check disk space during backup
df -h /mnt/backups

# Try again with smaller batch size
pg_dump -Fc --jobs=1 --file=backup.dump "$DATABASE_URL"
```

---

## Next Steps

1. **Backup Procedures:** Review this document and test all backup scripts in your environment
2. **Restore Plan:** See [RESTORE_PROCEDURES.md](./RESTORE_PROCEDURES.md)
3. **Validation:** See [VALIDATION_CHECKLIST.md](./VALIDATION_CHECKLIST.md)
4. **Runbook:** See [OPERATIONAL_RUNBOOK.md](./OPERATIONAL_RUNBOOK.md)
