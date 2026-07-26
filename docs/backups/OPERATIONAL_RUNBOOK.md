# Operational Runbook: Common Backup/Restore Scenarios

This runbook provides decision trees and quick actions for common operational issues and disasters.

**Quick Links:**
- [Scenario Decision Tree](#scenario-decision-tree)
- [Common Scenarios](#common-scenarios)
- [Emergency Contacts](#emergency-contacts)

---

## Scenario Decision Tree

```
START: I've detected an issue
│
├─ Is data currently accessible? (Can services read/write?)
│  ├─ YES → Go to: Issue Diagnosis
│  └─ NO → Go to: Data Loss / Corruption
│
├─ Issue Diagnosis: Where is the problem?
│  ├─ Backend metadata (auth, notifications)  → Backend Issues
│  ├─ Indexer events (raffles, tickets)       → Indexer Issues
│  ├─ Oracle queue (jobs, randomness)         → Oracle Issues
│  ├─ Redis cache (performance, counts)       → Cache Issues
│  └─ Multiple services affected              → Full Platform Recovery
│
└─ Data Loss / Corruption: How much data lost?
   ├─ Single table               → Partial Recovery
   ├─ Single service database    → Service Restore
   ├─ Multiple databases         → Full Restore
   └─ All systems down          → Disaster Recovery
```

---

## Common Scenarios

### 1. Backend Service Unreachable

**Symptom:** `curl http://localhost:3001/health` returns connection refused or times out

**Diagnosis:**
```bash
# Step 1: Check if container is running
docker ps | grep backend

# Step 2: Check logs
docker logs backend | tail -50

# Step 3: Check database connectivity from container
docker exec backend psql "$BACKEND_DB_URL" -c "SELECT 1;"

# Step 4: Check port binding
netstat -tulpn | grep 3001
```

**Common Causes & Fixes:**

| Cause | Fix |
|-------|-----|
| Container crashed | `docker-compose -f backend/docker-compose.yml restart` |
| Database unreachable | Verify Postgres is running and accessible |
| OOM (out of memory) | Check available memory: `free -h` |
| Configuration error | Verify .env variables and secrets |

**Resolution Path:**
```bash
# If database is the issue:
# 1. Verify Postgres
psql "$BACKEND_DB_URL" -c "SELECT version();"

# 2. If Postgres is down, start it
docker-compose -f backend/docker-compose.yml up -d postgres

# 3. Wait for Postgres to be ready
sleep 10

# 4. Restart backend
docker-compose -f backend/docker-compose.yml restart backend

# 5. Verify
curl -f http://localhost:3001/health
```

**Escalation:** If still failing after 5 minutes, proceed to Backend Data Validation

---

### 2. Indexer Falling Behind (High Lag)

**Symptom:** Indexer `/health` shows `lag: 15000+` or indexer logs show "catching up"

**Diagnosis:**
```bash
# Get current lag
curl -s http://localhost:3002/health | jq '.lag'

# Check Horizon sync
CURSOR=$(psql "$INDEXER_DB_URL" -t -c "SELECT ledger_sequence FROM indexer_cursor;")
HORIZON=$(curl -s https://horizon.stellar.org/ledgers | jq '.records[0].sequence')
echo "Lag: $((HORIZON - CURSOR)) ledgers"

# Check indexer CPU/memory
docker stats indexer --no-stream
```

**Causes & Fixes:**

| Cause | Fix | ETA |
|-------|-----|-----|
| Normal catch-up after deploy | Wait and monitor | 1-24h depending on ledger range |
| Database slow queries | Check query plans | 30m to optimize |
| Redis down/slow | Restart Redis | 5m |
| Indexer process stuck | Restart indexer | 2-5m + catch-up |

**Resolution Path:**
```bash
# Option 1: Let it catch up naturally (safest)
watch -n 30 'curl -s http://localhost:3002/health | jq ".lag"'

# Option 2: If stuck, restart (will resume from cursor position)
docker-compose -f indexer/docker-compose.yml restart

# Option 3: If severely behind (>100k ledgers), check logs
docker logs indexer | tail -100 | grep -i error

# Option 4: Check database performance
psql "$INDEXER_DB_URL" -c "SELECT COUNT(*) FROM raffle_event WHERE created_at > NOW() - INTERVAL '1 hour';"
```

**Escalation:** If lag isn't decreasing after 1 hour, may need database optimization or replay from chain

---

### 3. Database Queries Returning Wrong Data

**Symptom:** API returns stale or incorrect data, or database shows inconsistencies

**Diagnosis:**
```bash
# Step 1: Check recent data
psql "$BACKEND_DB_URL" -c "SELECT * FROM raffle_metadata ORDER BY updated_at DESC LIMIT 5;"

# Step 2: Check for orphaned records
psql "$INDEXER_DB_URL" -c "
  SELECT COUNT(*) FROM ticket t
  WHERE NOT EXISTS (SELECT 1 FROM raffle r WHERE r.id = t.raffle_id);
"

# Step 3: Verify cache isn't causing issues
redis-cli -h "$BACKEND_REDIS_HOST" -p "$BACKEND_REDIS_PORT" FLUSHDB

# Step 4: Retry query
curl -s http://localhost:3001/raffles/1 | jq '.raffle'
```

**Possible Fixes:**

```bash
# Option 1: Clear and rebuild cache
redis-cli -h "$BACKEND_REDIS_HOST" FLUSHDB
# Wait 5-10 minutes for cache to warm

# Option 2: Restart specific service
docker-compose -f backend/docker-compose.yml restart

# Option 3: Verify backup is current, may need restore
# See: RESTORE_PROCEDURES.md > Backend-Only Restore
```

---

### 4. Redis Out of Memory

**Symptom:** Redis operations fail with "OOM command not allowed when used memory > 'maxmemory'"

**Diagnosis:**
```bash
# Check Redis memory
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO memory

# Check eviction policy
redis-cli CONFIG GET maxmemory-policy

# See what keys are consuming memory
redis-cli --bigkeys

# Check key sizes
redis-cli --scan --pattern '*' | while read key; do
  echo -n "$key: "
  redis-cli STRLEN "$key"
done | sort -t: -k2 -rn | head -20
```

**Fixes:**

```bash
# Option 1: Clear old cache entries
redis-cli -h "$REDIS_HOST" FLUSHDB

# Option 2: Increase maxmemory
redis-cli CONFIG SET maxmemory 2gb
redis-cli CONFIG REWRITE

# Option 3: Change eviction policy to be more aggressive
redis-cli CONFIG SET maxmemory-policy "allkeys-lru"
redis-cli CONFIG REWRITE

# Option 4: Monitor memory over time
watch -n 5 'redis-cli INFO memory | grep used_memory'
```

---

### 5. Oracle Queue Jobs Stuck or Not Processing

**Symptom:** Oracle logs show no recent job processing, Bull queue has jobs but nothing happening

**Diagnosis:**
```bash
# Check Bull queue state
redis-cli -h "$ORACLE_REDIS_HOST" -p "$ORACLE_REDIS_PORT" \
  --scan --pattern 'bull:*:active' | while read key; do
    echo "$key: $(redis-cli -h "$ORACLE_REDIS_HOST" LLEN "$key")"
  done

# Check Oracle logs
docker logs oracle | tail -100 | grep -i "error\|job"

# Check if jobs are stuck
redis-cli -h "$ORACLE_REDIS_HOST" -p "$ORACLE_REDIS_PORT" \
  --scan --pattern 'bull:*:stuck' | while read key; do
    echo "Stuck jobs in $key: $(redis-cli -h "$ORACLE_REDIS_HOST" LLEN "$key")"
  done
```

**Fixes:**

```bash
# Option 1: Restart Oracle service
docker-compose -f oracle/docker-compose.yml restart

# Option 2: Clear stuck jobs
# (Use with caution - jobs will need to be re-created)
redis-cli -h "$ORACLE_REDIS_HOST" DEL bull:randomness-queue:stuck

# Option 3: Rebuild queue from contract state
docker exec oracle npm run cli -- rebuild-queue

# Option 4: Check for event listener issues
docker logs oracle | grep -i "listener\|event"

# Option 5: If all else fails, restore Redis from backup
# See: RESTORE_PROCEDURES.md > Oracle Redis + Queue State Backup
```

---

### 6. Connection Timeouts Between Services

**Symptom:** Backend can't reach indexer, or services timing out on cross-service calls

**Diagnosis:**
```bash
# Check network connectivity
docker network ls
docker network inspect tikka-network

# Check if all services are on same network
docker ps --format "table {{.Names}}\t{{.Networks}}"

# Test connectivity from backend container
docker exec backend curl -s http://indexer:3002/health

# Check firewall rules
sudo iptables -L -n | grep 3002

# Check DNS
docker exec backend nslookup indexer
```

**Fixes:**

```bash
# Option 1: Ensure all services are on same network
docker network create tikka-network 2>/dev/null || true

# Option 2: Restart affected services
docker-compose down
docker-compose up -d

# Option 3: Verify service addresses in .env
echo "INDEXER_URL=$INDEXER_URL"

# Option 4: If using hostnames, verify DNS works
docker exec backend ping -c 1 indexer

# Option 5: Check service port binding
docker port indexer 3002
```

---

### 7. Accidental Data Deletion

**Symptom:** User/admin accidentally deleted important data, need to recover specific records

**How to Respond (First 5 Minutes):**

```bash
# 1. STOP - Prevent overwriting backups
# Put on maintenance mode
docker-compose down

# 2. PRESERVE - Capture current state before doing anything
pg_dump -Fc --file=state-before-restore.dump "$BACKEND_DB_URL"

# 3. INVESTIGATE - What was deleted?
# Query transaction logs if available
psql "$BACKEND_DB_URL" -c "SELECT * FROM raffle_metadata WHERE id = <deleted_id>;" 2>/dev/null || echo "Deleted"
```

**Recovery Options (in order of preference):**

```bash
# Option 1: Restore specific table from backup
# See: RESTORE_PROCEDURES.md > Recover Specific Tables Only

# Option 2: Restore entire service database from backup
# See: RESTORE_PROCEDURES.md > Service-Specific Restore

# Option 3: Restore from point-in-time recovery
# See: RESTORE_PROCEDURES.md > Point-in-Time Recovery
```

**Prevention:**

```bash
# Enable PITR by archiving WAL files (Postgres)
# Implement audit logging for DELETE operations
# Add soft-delete columns to critical tables
# Use foreign key constraints to prevent orphaning
```

---

### 8. Full Platform Outage

**Symptom:** Multiple services down, users can't access platform

**First 5 Minutes (Incident Response):**

```bash
# 1. Assess situation
docker-compose ps
curl -s http://localhost:3001/health
curl -s http://localhost:3002/health

# 2. Check system resources
free -h
df -h
docker stats --no-stream

# 3. Check logs for clues
docker logs backend 2>&1 | tail -20
docker logs indexer 2>&1 | tail -20
docker logs oracle 2>&1 | tail -20

# 4. Notify team
# -> #incident channel in Slack
# -> On-call engineer
```

**Recovery Steps:**

```bash
# Option 1: Graceful restart (fastest, ~5 min)
docker-compose down
docker-compose up -d
# Monitor: curl http://localhost:3001/health (retry for ~2 min)

# Option 2: Full restore from backup (30-120 min)
# See: RESTORE_PROCEDURES.md > Full Platform Restore

# Option 3: If unsure which option, call on-call lead
# Decision depends on: known issues, backup age, team availability
```

**Decision Matrix:**

| Issue | Action | Time |
|-------|--------|------|
| Services crash & won't start | Graceful restart | 5 min |
| Graceful restart fails | Check logs, resolve issue | 10-30 min |
| Still won't start | Full restore from backup | 60-120 min |
| No working backup | Engage vendor support / recover from chain | 2-8 hours |

---

### 9. Backup Itself Is Corrupted

**Symptom:** Restore fails with "backup file appears to be corrupted" or integrity checks fail

**Diagnosis:**
```bash
# Verify backup file integrity
pg_restore --list /path/to/backup.dump | head -20

# Check file size vs expected
ls -lh /path/to/backup.dump

# Try extracting with tar (if tar format)
tar -tzf /path/to/backup.tar.gz | head -20
```

**Options:**

```bash
# Option 1: Use older backup
ls -lt $BACKUP_DIR/backend/*/backend-postgres.dump | head -5
# Pick a different backup timestamp and restore from that

# Option 2: Rebuild from chain
# For indexer: See RESTORE_PROCEDURES.md > Rebuild Indexer from Chain

# Option 3: If multiple backups are corrupted
# May indicate storage issue - check disk health
sudo smartctl -a /dev/sda

# Option 4: Last resort - replay state from chain events
# Contact on-call engineer for guidance
```

---

### 10. Need to Roll Back to Previous State

**Symptom:** New deployment caused issues, need to restore to previous stable state

**Process:**

```bash
# 1. Find timestamp of last good backup
ls -lt $BACKUP_DIR/backend/ | head -5

# 2. Use specific timestamp
BACKUP_TIMESTAMP="20240529_020000"  # Yesterday's backup

# 3. Follow restore procedures with specific timestamp
# See: RESTORE_PROCEDURES.md > Service-Specific Restore

# 4. Verify after restore
curl http://localhost:3001/health

# 5. Document what went wrong
# -> Create incident post-mortem
# -> Update deployment checklist
```

---

## Performance Under Load

**Symptom:** System is slow when users are accessing it heavily

**Diagnosis:**
```bash
# Check CPU/Memory/Disk
docker stats --no-stream

# Check query performance
psql "$BACKEND_DB_URL" -c "EXPLAIN ANALYZE SELECT * FROM raffle_metadata LIMIT 10;"

# Check Redis performance
redis-cli -h "$BACKEND_REDIS_HOST" LATENCY DOCTOR

# Check network I/O
iftop -n  # If available

# Check database connection count
psql "$BACKEND_DB_URL" -c "SELECT count(*) FROM pg_stat_activity;"
```

**Fixes:**

```bash
# Option 1: Increase cache
redis-cli CONFIG SET maxmemory 2gb

# Option 2: Optimize slow queries
psql "$BACKEND_DB_URL" -c "CREATE INDEX idx_raffle_metadata_updated ON raffle_metadata(updated_at);"

# Option 3: Add database replicas for read queries
# Requires infrastructure changes - consult arch team

# Option 4: Use CDN for static assets
# Update frontend deployment config

# Option 5: Implement query caching if not already done
# Check METADATA_CACHE_TTL_SECONDS setting
```

---

## Emergency Contacts

### Internal Escalation

1. **Service Owner:** [Name/Slack handle]
2. **Backend Lead:** [Name/Slack handle]
3. **Indexer Lead:** [Name/Slack handle]
4. **Oracle Lead:** [Name/Slack handle]
5. **On-Call Engineer (after hours):** [Rotation schedule]

### External Resources

- **Stellar Foundation:** https://discord.gg/stellar
- **Soroban Support:** [Support channel]
- **Postgres Documentation:** https://www.postgresql.org/docs/
- **Redis Documentation:** https://redis.io/documentation

### Runbook Updates

If you need to add new scenarios to this runbook:
1. Document the symptom and diagnosis steps
2. Include multiple fix options with time estimates
3. Add to appropriate section or create new section
4. Update Table of Contents
5. Test the scenario if possible

---

## Checklist: Before Declaring Incident Resolved

- [ ] All services are running and healthy
- [ ] Health endpoints return 200 OK
- [ ] Sample queries succeed (backend, indexer APIs)
- [ ] No errors in service logs (tail -50)
- [ ] Team is notified of resolution
- [ ] Incident is documented (what happened, how it was fixed)
- [ ] Follow-up actions identified (if applicable)
- [ ] Post-mortem scheduled (if major incident)

---

## See Also

- [Backup Procedures](./BACKUP_PROCEDURES.md)
- [Restore Procedures](./RESTORE_PROCEDURES.md)
- [Validation Checklist](./VALIDATION_CHECKLIST.md)
- [Architecture Overview](../ARCHITECTURE.md)
