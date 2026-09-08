# Post-Restore Validation Checklist

This checklist ensures all data has been restored correctly and services are functioning as expected.

**Estimated Duration:** 30-45 minutes  
**When to use:** After any restore operation (full, partial, or service-specific)

---

## Phase 1: Infrastructure Readiness (5-10 minutes)

### Database Connectivity

- [ ] **Backend Postgres:** Run `psql "$BACKEND_DB_URL" -c "SELECT version();"`
  - Expected: PostgreSQL version and connection info
  - If fails: Check credentials, firewall, and service status

- [ ] **Indexer Postgres:** Run `psql "$INDEXER_DB_URL" -c "SELECT version();"`
  - Expected: PostgreSQL version and connection info
  - If fails: Check credentials, firewall, and service status

- [ ] **Backend Redis:** Run `redis-cli -h "$BACKEND_REDIS_HOST" -p "$BACKEND_REDIS_PORT" PING`
  - Expected: `PONG`
  - If fails: Check firewall and Redis service status

- [ ] **Indexer Redis:** Run `redis-cli -h "$INDEXER_REDIS_HOST" -p "$INDEXER_REDIS_PORT" PING`
  - Expected: `PONG`
  - If fails: Check firewall and Redis service status

- [ ] **Oracle Redis:** Run `redis-cli -h "$ORACLE_REDIS_HOST" -p "$ORACLE_REDIS_PORT" PING`
  - Expected: `PONG`
  - If fails: Check firewall and Redis service status

### Service Health Endpoints

- [ ] **Backend Service:**
  ```bash
  curl -s http://localhost:3001/health | jq '.'
  ```
  - Expected: HTTP 200 with health status
  - Status should show `"status": "ok"` or `"healthy": true`

- [ ] **Indexer Service:**
  ```bash
  curl -s http://localhost:3002/health | jq '.'
  ```
  - Expected: HTTP 200 with indexer lag information
  - Check `lag` value (should be < 1000 ledgers if recently synced)

- [ ] **Oracle Service:**
  ```bash
  curl -s http://localhost:3003/health | jq '.'
  ```
  - Expected: HTTP 200 (if exposed; Oracle typically only has internal health)

---

## Phase 2: Backend Data Validation (10-15 minutes)

### Authentication System

- [ ] **Nonce generation works:**
  ```bash
  curl -s -X GET "http://localhost:3001/auth/nonce?address=GBRPYHIL2CI3WHZDTOOQFC6EB4PSQJNPPIS7K77Y4PENDI42EV4FXU7" | jq '.'
  ```
  - Expected: Returns `{ nonce, issuedAt, expiresAt, message }`
  - If fails: Check auth service logs

- [ ] **Verify token validation works (sign a message in test wallet)**
  ```bash
  # After signing nonce in wallet, verify it:
  curl -s -X POST "http://localhost:3001/auth/verify" \
    -H "Content-Type: application/json" \
    -d '{"address":"GBRPYHIL2CI3WHZDTOOQFC6EB4PSQJNPPIS7K77Y4PENDI42EV4FXU7","signature":"...","nonce":"..."}' | jq '.'
  ```
  - Expected: Returns `{ accessToken, refreshToken }`
  - If fails: Check auth service logs and Supabase configuration

### Metadata Tables

- [ ] **Raffle metadata exists:**
  ```bash
  psql "$BACKEND_DB_URL" -c "SELECT COUNT(*) as raffle_count FROM raffle_metadata;"
  ```
  - Expected: Should show count > 0 if data was present in backup
  - If 0: Check if backup included metadata (may be expected for fresh start)

- [ ] **User data exists:**
  ```bash
  psql "$BACKEND_DB_URL" -c "SELECT COUNT(*) as user_count FROM users;"
  ```
  - Expected: Should match backup state

- [ ] **Notifications are accessible:**
  ```bash
  psql "$BACKEND_DB_URL" -c "SELECT COUNT(*) as notification_count FROM notifications LIMIT 10;"
  ```
  - Expected: Query succeeds, count matches backup

- [ ] **Sample metadata query:**
  ```bash
  curl -s "http://localhost:3001/raffles/1/metadata" \
    -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'
  ```
  - Expected: Returns raffle metadata with title, description, image_url

### Redis Cache Health

- [ ] **Cache keys are present:**
  ```bash
  redis-cli -h "$BACKEND_REDIS_HOST" -p "$BACKEND_REDIS_PORT" KEYS "metadata:*" | head -20
  ```
  - Expected: Shows some cached keys
  - Note: Cache can warm up over time; absence of keys is recoverable

- [ ] **Cache TTL is correct:**
  ```bash
  redis-cli -h "$BACKEND_REDIS_HOST" -p "$BACKEND_REDIS_PORT" TTL "metadata:raffle:1"
  ```
  - Expected: Positive number (TTL in seconds) or -1 (no expiry)
  - If -2: Key doesn't exist (cache is empty, will rebuild)

---

## Phase 3: Indexer Data Validation (10-15 minutes)

### Cursor Position

- [ ] **Indexer cursor is valid:**
  ```bash
  psql "$INDEXER_DB_URL" -c "SELECT * FROM indexer_cursor LIMIT 1;"
  ```
  - Expected: Shows current ledger sequence and timestamp
  - Typical values: `ledger_sequence: 50000000+, last_update: 2024-05-30...`

- [ ] **Cursor matches expected state:**
  ```bash
  # Compare cursor ledger to current Horizon ledger
  CURSOR_LEDGER=$(psql "$INDEXER_DB_URL" -t -c "SELECT ledger_sequence FROM indexer_cursor;")
  HORIZON_LEDGER=$(curl -s https://horizon.stellar.org/ledgers | jq '.records[0].sequence')
  echo "Cursor: $CURSOR_LEDGER, Horizon: $HORIZON_LEDGER, Lag: $((HORIZON_LEDGER - CURSOR_LEDGER))"
  ```
  - Expected: Lag < 1000 ledgers (if indexer just caught up)
  - If lag > 10000: Indexer may need time to catch up

### Event Data

- [ ] **Raffle events exist:**
  ```bash
  psql "$INDEXER_DB_URL" -c "SELECT COUNT(*) as raffle_count FROM raffle;"
  ```
  - Expected: > 0 if backup had raffles

- [ ] **Ticket data is intact:**
  ```bash
  psql "$INDEXER_DB_URL" -c "SELECT COUNT(*) as ticket_count FROM ticket;"
  ```
  - Expected: Matches backup state

- [ ] **User entries are present:**
  ```bash
  psql "$INDEXER_DB_URL" -c "SELECT COUNT(*) as user_count FROM \"user\";"
  ```
  - Expected: Matches backup state

### Data Consistency Checks

- [ ] **No orphaned records:**
  ```bash
  psql "$INDEXER_DB_URL" -c "
    SELECT COUNT(*) FROM ticket t
    WHERE NOT EXISTS (SELECT 1 FROM raffle r WHERE r.id = t.raffle_id);
  "
  ```
  - Expected: 0 orphaned records
  - If > 0: Data corruption may have occurred

- [ ] **Raffle status is consistent:**
  ```bash
  psql "$INDEXER_DB_URL" -c "
    SELECT status, COUNT(*) FROM raffle GROUP BY status;
  "
  ```
  - Expected: Shows distribution of raffle statuses (draft, active, closed, finished, winner_drawn)

### Sample API Queries

- [ ] **Raffles API works:**
  ```bash
  curl -s "http://localhost:3002/raffles?limit=5" | jq '.raffles | length'
  ```
  - Expected: Returns array of raffles with count > 0 or 0 if filtered

- [ ] **Single raffle detail works:**
  ```bash
  curl -s "http://localhost:3002/raffles/1" | jq '.raffle | keys'
  ```
  - Expected: Returns raffle object with fields like id, status, ticker, etc.

- [ ] **Tickets endpoint works:**
  ```bash
  curl -s "http://localhost:3002/tickets?raffleId=1&limit=5" | jq '.tickets | length'
  ```
  - Expected: Returns array of tickets

---

## Phase 4: Oracle State Validation (5-10 minutes)

### Queue Health

- [ ] **Bull queue keys exist:**
  ```bash
  redis-cli -h "$ORACLE_REDIS_HOST" -p "$ORACLE_REDIS_PORT" KEYS "bull:*" | head -10
  ```
  - Expected: Shows Bull queue keys
  - If empty: Queue was empty or not restored; jobs can be re-enqueued from events

- [ ] **Job counts are reasonable:**
  ```bash
  redis-cli -h "$ORACLE_REDIS_HOST" -p "$ORACLE_REDIS_PORT" \
    --scan --pattern 'bull:*:id' | wc -l
  ```
  - Expected: Job ID count > 0 or 0 if queue was empty

- [ ] **Job state is valid:**
  ```bash
  redis-cli -h "$ORACLE_REDIS_HOST" -p "$ORACLE_REDIS_PORT" \
    GET "bull:randomness-queue:active"
  ```
  - Expected: Shows active job IDs or empty if no active jobs

### Oracle Processing

- [ ] **Oracle logs show activity:**
  ```bash
  docker logs oracle | tail -50 | grep -i "processing\|job\|complete"
  ```
  - Expected: Recent activity showing job processing
  - If errors: Check logs for failures

- [ ] **No excessive retries or failures:**
  ```bash
  docker logs oracle | tail -100 | grep -i "error\|fail" | wc -l
  ```
  - Expected: < 10 errors in recent logs
  - If many: Investigate specific failures

---

## Phase 5: Cross-Service Integration (5-10 minutes)

### Data Flow Validation

- [ ] **Backend can query indexer data:**
  ```bash
  # From backend service, query indexer
  curl -s "http://localhost:3001/raffles" | jq '.raffles[0]' | grep -q "ticker"
  ```
  - Expected: Backend returns raffle data merged with indexer info

- [ ] **Indexer cursor affects backend API:**
  ```bash
  # Check that indexer lag doesn't cause API errors
  curl -s "http://localhost:3001/raffles?limit=1" | jq '.raffles | length'
  ```
  - Expected: Returns raffles even if indexer is catching up

- [ ] **Oracle queue can process jobs:**
  ```bash
  # Monitor Oracle logs for job processing
  docker logs oracle | tail -50 | grep -i "processing randomness\|job complete"
  ```
  - Expected: Shows active job processing

### End-to-End User Flow

- [ ] **Auth -> Raffle List -> Raffle Detail works:**
  ```bash
  # 1. Get nonce
  NONCE=$(curl -s "http://localhost:3001/auth/nonce?address=GTEST..." | jq -r '.nonce')
  
  # 2. List raffles (public, no auth needed)
  curl -s "http://localhost:3001/raffles" | jq '.raffles | length'
  
  # 3. Get raffle detail
  curl -s "http://localhost:3001/raffles/1" | jq '.raffle.title'
  ```
  - Expected: Each step returns valid data

---

## Phase 6: Performance Checks (5-10 minutes)

### Query Performance

- [ ] **Raffle list query is fast:**
  ```bash
  time psql "$INDEXER_DB_URL" -c "SELECT * FROM raffle LIMIT 100;" > /dev/null
  ```
  - Expected: Completes in < 1 second
  - If > 2 seconds: May need index analysis

- [ ] **Metadata queries are fast:**
  ```bash
  time psql "$BACKEND_DB_URL" -c "SELECT * FROM raffle_metadata LIMIT 100;" > /dev/null
  ```
  - Expected: Completes in < 500ms

### Cache Performance

- [ ] **Cache hits are registered:**
  ```bash
  redis-cli -h "$BACKEND_REDIS_HOST" -p "$BACKEND_REDIS_PORT" INFO stats | grep hits
  ```
  - Expected: hit_rate > 0 if cache is active

- [ ] **No excessive memory usage:**
  ```bash
  redis-cli -h "$BACKEND_REDIS_HOST" -p "$BACKEND_REDIS_PORT" INFO memory | grep used_memory_human
  ```
  - Expected: Reasonable value (< 1GB typical for cache)

---

## Phase 7: Backup Metadata Validation (5 minutes)

### Restore Artifacts

- [ ] **Backup manifest files exist:**
  ```bash
  ls -la "$BACKUP_DIR/backend/$BACKUP_TIMESTAMP/MANIFEST.json"
  ls -la "$BACKUP_DIR/indexer/$BACKUP_TIMESTAMP/MANIFEST.json"
  ls -la "$BACKUP_DIR/oracle/$BACKUP_TIMESTAMP/MANIFEST.json"
  ```
  - Expected: All files present and readable

- [ ] **Manifests are valid JSON:**
  ```bash
  jq . "$BACKUP_DIR/backend/$BACKUP_TIMESTAMP/MANIFEST.json" > /dev/null && echo "Valid"
  ```
  - Expected: Output "Valid" with no errors

- [ ] **Backup sizes are reasonable:**
  ```bash
  du -sh "$BACKUP_DIR/backend/$BACKUP_TIMESTAMP"/*
  du -sh "$BACKUP_DIR/indexer/$BACKUP_TIMESTAMP"/*
  ```
  - Expected: Dumpsizes match original database sizes (within 10%)

---

## Validation Failure Resolution

### If Backend Database Validation Fails

```bash
# 1. Check database connectivity
psql "$BACKEND_DB_URL" -c "SELECT 1;"

# 2. Check for schema errors
psql "$BACKEND_DB_URL" -c "\dt"  # List all tables

# 3. Check logs
docker logs backend | tail -100 | grep -i "error\|fail"

# 4. Retry restore if needed
# Follow: RESTORE_PROCEDURES.md > Backend-Only Restore
```

### If Indexer Validation Fails

```bash
# 1. Check indexer logs
docker logs indexer | tail -100

# 2. Check cursor state
psql "$INDEXER_DB_URL" -c "SELECT * FROM indexer_cursor;"

# 3. If lag is high, wait for catch-up (can take hours)
watch -n 10 'psql "$INDEXER_DB_URL" -c "SELECT ledger_sequence FROM indexer_cursor;"'

# 4. If stuck, may need replay from chain
# Follow: RESTORE_PROCEDURES.md > Rebuild Indexer from Chain
```

### If Oracle Queue is Empty

```bash
# 1. Check if queue needs to be rebuilt
redis-cli -h "$ORACLE_REDIS_HOST" -p "$ORACLE_REDIS_PORT" KEYS "bull:*" | wc -l

# 2. If empty, rebuild from contract state
docker exec oracle npm run cli -- rebuild-queue

# 3. Monitor for job processing
docker logs oracle | tail -50 | grep "processing"
```

### If Cache is Completely Empty

```bash
# This is normal! Cache will warm automatically.
# Monitor progress:
redis-cli -h "$BACKEND_REDIS_HOST" -p "$BACKEND_REDIS_PORT" DBSIZE

# After 5-10 minutes of traffic:
redis-cli -h "$BACKEND_REDIS_HOST" -p "$BACKEND_REDIS_PORT" INFO stats
```

---

## Sign-Off Checklist

**Date:** _______________  
**Performed By:** _______________  
**Team Lead Review:** _______________

### Critical Items (must pass)

- [ ] All databases are connected and accessible
- [ ] Backend Postgres has data (raffle_metadata, users)
- [ ] Indexer Postgres has data (raffles, tickets, users)
- [ ] All health endpoints return 200 OK
- [ ] No obvious errors in service logs (tail -50 of each service)

### Important Items (should pass)

- [ ] Indexer cursor lag < 10,000 ledgers
- [ ] Backend and indexer APIs return sample data
- [ ] Auth system issues nonce and validates tokens
- [ ] No orphaned database records detected
- [ ] Query performance is acceptable (< 2 seconds)

### Nice-to-Have (can defer)

- [ ] Cache is warming (keys are being stored)
- [ ] Oracle queue is processing jobs
- [ ] All cross-service data flows work
- [ ] Performance metrics look good

---

## Next Steps

1. **If all checks pass:** Document the successful restore timestamp and notify stakeholders
2. **If any checks fail:** 
   - Refer to specific failure resolution section above
   - Consult [OPERATIONAL_RUNBOOK.md](./OPERATIONAL_RUNBOOK.md) for additional guidance
   - Contact on-call team if unable to resolve
3. **Post-restore:** See [OPERATIONAL_RUNBOOK.md](./OPERATIONAL_RUNBOOK.md) for post-incident procedures
