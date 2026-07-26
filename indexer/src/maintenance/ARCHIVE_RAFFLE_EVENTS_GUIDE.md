# Raffle Events Archiving Guide

## Overview

The raffle events archiving utility provides a robust, resumable mechanism for archiving old `raffle_events` records to CSV files and safely removing them from the database. This tool is designed for production use with built-in safety features including checkpointing, dry-run simulation, and batch limits.

## Features

✅ **Resumable Checkpointing** - Safely resume after interruptions (deployments, crashes, network failures)  
✅ **Dry-Run Mode** - Simulate archiving without modifying the database  
✅ **Batch Limits** - Cap processing to prevent resource exhaustion  
✅ **Transactional Safety** - Atomic checkpoint updates with deletions  
✅ **Structured Logging** - JSON-formatted progress tracking  
✅ **CSV Export** - Human-readable archive format with proper escaping

## Architecture

### Checkpoint State Management

The archiver uses a dedicated `archive_checkpoints` database table to track progress:

```sql
CREATE TABLE archive_checkpoints (
  id UUID PRIMARY KEY,
  job_type VARCHAR(64),
  last_processed_timestamp TIMESTAMPTZ,
  last_processed_id UUID,
  total_archived INTEGER,
  batch_number INTEGER,
  status VARCHAR(20), -- 'in_progress', 'completed', 'failed'
  config_snapshot JSONB,
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
```

### Resumption Logic

1. Query for existing `in_progress` checkpoint for job type
2. Validate checkpoint matches current cutoff date
3. Resume from `last_processed_timestamp` + `last_processed_id`
4. Update checkpoint after each successful batch (transactionally)
5. Mark as `completed` when no more records found

### Safety Guarantees

- **No Duplicate Processing**: Cursor-based pagination with timestamp + ID tie-breaking
- **Atomic Operations**: Checkpoint updates in same transaction as deletions
- **Concurrent Safety**: Row-level locking prevents multiple simultaneous runs
- **Crash Recovery**: Resume from last successful batch after any interruption

## Usage

### Basic Usage

```bash
# Dry-run (default) - simulates archiving without modifications
npm run archive:raffle-events

# Production run - actually archives and deletes records
DRY_RUN=false npm run archive:raffle-events
```

### Configuration Options

All options are configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `RAFFLE_EVENTS_RETENTION_DAYS` | `30` | Age threshold for archiving (days) |
| `BATCH_SIZE` | `500` | Records per batch |
| `MAX_BATCH` | `unlimited` | Maximum batches to process in one run |
| `DRY_RUN` | `true` | Simulate without database modifications |
| `RESUME` | `true` | Resume from checkpoint if available |

### Common Scenarios

#### 1. Test Archiving (Dry-Run)

```bash
# Preview what would be archived
RAFFLE_EVENTS_RETENTION_DAYS=60 \
DRY_RUN=true \
npm run archive:raffle-events
```

**Expected Output:**
```json
{"timestamp":"2026-05-30T12:00:00.000Z","message":"[DRY-RUN] Batch 1 completed: would archive 500 records (no deletion)","batchNumber":1,"totalArchived":500}
{"message":"Archival complete","result":{"totalArchived":1500,"batchesProcessed":3,"filesCreated":3,"resumed":false,"reachedMaxBatch":false}}
```

#### 2. Production Archiving

```bash
# Archive events older than 90 days
RAFFLE_EVENTS_RETENTION_DAYS=90 \
DRY_RUN=false \
npm run archive:raffle-events
```

#### 3. Incremental Archiving (Batch Limits)

```bash
# Process only 10 batches per run (for gradual archiving)
RAFFLE_EVENTS_RETENTION_DAYS=30 \
BATCH_SIZE=1000 \
MAX_BATCH=10 \
DRY_RUN=false \
npm run archive:raffle-events
```

**Use Case**: Spread archiving across multiple runs to avoid long-running transactions.

#### 4. Resume After Interruption

```bash
# Automatically resumes from last checkpoint
DRY_RUN=false \
RESUME=true \
npm run archive:raffle-events
```

**Scenario**: Previous run was interrupted at batch 5. This run will:
1. Find existing checkpoint
2. Resume from last processed record
3. Continue from batch 6 onwards

#### 5. Fresh Start (Ignore Checkpoints)

```bash
# Start from beginning, ignoring existing checkpoints
DRY_RUN=false \
RESUME=false \
npm run archive:raffle-events
```

**Warning**: Only use this if you're certain no concurrent archiving is running.

## Output Files

### CSV Format

Archives are written to `./archives/` directory with the following naming:

```
raffle_events_2026-05-30_batch0001.csv
raffle_events_2026-05-30_batch0002.csv
raffle_events_2026-05-30_batch0003.csv
```

### CSV Schema

```csv
id,raffle_id,event_type,schema_version,ledger,tx_hash,payload_json,indexed_at
a1b2c3d4-...,123,RaffleCreated,1,1000000,abc123...,"{"price":10,"max_tickets":100}",2026-01-15T10:30:00.000Z
```

**Fields:**
- `id` - UUID primary key
- `raffle_id` - Contract raffle ID
- `event_type` - Event name (RaffleCreated, TicketPurchased, etc.)
- `schema_version` - Event schema version
- `ledger` - Stellar ledger sequence
- `tx_hash` - Transaction hash (idempotency key)
- `payload_json` - Full event payload (JSON-escaped)
- `indexed_at` - Timestamp when event was indexed

### CSV Features

- **Proper Escaping**: Commas and quotes in fields are properly escaped
- **JSON Flattening**: Newlines in JSON removed for single-line records
- **Header Row**: First row contains column names
- **UTF-8 Encoding**: Full Unicode support

## Monitoring & Observability

### Structured Logging

All log output is JSON-formatted for easy parsing:

```json
{
  "timestamp": "2026-05-30T12:00:00.000Z",
  "message": "Processing batch 5: 500 records",
  "batchNumber": 5,
  "totalArchived": 2500,
  "currentBatchSize": 500
}
```

### Progress Tracking

Monitor archiving progress in real-time:

```bash
# Watch progress
npm run archive:raffle-events 2>&1 | jq -r '.message'

# Track total archived
npm run archive:raffle-events 2>&1 | jq -r '.totalArchived'
```

### Checkpoint Inspection

Query checkpoint status directly:

```sql
-- View active checkpoints
SELECT 
  id,
  job_type,
  batch_number,
  total_archived,
  status,
  started_at,
  updated_at
FROM archive_checkpoints
WHERE job_type = 'raffle_events'
ORDER BY started_at DESC
LIMIT 5;

-- Check last processed position
SELECT 
  last_processed_timestamp,
  last_processed_id,
  total_archived
FROM archive_checkpoints
WHERE job_type = 'raffle_events'
  AND status = 'in_progress'
ORDER BY started_at DESC
LIMIT 1;
```

## Operational Procedures

### Pre-Archiving Checklist

1. **Verify Retention Policy**: Confirm retention days with stakeholders
2. **Check Disk Space**: Ensure sufficient space for CSV files
3. **Test with Dry-Run**: Always run dry-run first to preview impact
4. **Review Checkpoint State**: Check for existing in-progress checkpoints
5. **Schedule Maintenance Window**: Plan for production archiving during low-traffic periods

### During Archiving

1. **Monitor Progress**: Watch structured logs for batch completion
2. **Check Database Load**: Monitor CPU/memory/disk I/O
3. **Verify CSV Creation**: Confirm files are being written to archives directory
4. **Track Checkpoint Updates**: Ensure checkpoint is being updated after each batch

### Post-Archiving Verification

1. **Verify Record Counts**: Compare `totalArchived` with expected count
2. **Validate CSV Files**: Spot-check CSV content for correctness
3. **Check Checkpoint Status**: Confirm checkpoint marked as `completed`
4. **Test Data Restoration**: Verify CSV can be imported if needed
5. **Backup Archives**: Copy CSV files to long-term storage (S3, etc.)

### Troubleshooting

#### Archiving Stuck or Slow

**Symptoms**: Batches taking longer than expected

**Diagnosis**:
```sql
-- Check for long-running transactions
SELECT pid, state, query_start, query
FROM pg_stat_activity
WHERE query LIKE '%raffle_events%'
  AND state = 'active';

-- Check table bloat
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename = 'raffle_events';
```

**Solutions**:
- Reduce `BATCH_SIZE` to smaller chunks
- Use `MAX_BATCH` to limit processing per run
- Run `VACUUM ANALYZE raffle_events` to optimize queries
- Schedule archiving during off-peak hours

#### Checkpoint Not Resuming

**Symptoms**: Archiving starts from beginning despite existing checkpoint

**Diagnosis**:
```sql
-- Check checkpoint status
SELECT * FROM archive_checkpoints
WHERE job_type = 'raffle_events'
ORDER BY started_at DESC
LIMIT 1;
```

**Solutions**:
- Verify `RESUME=true` is set
- Check if cutoff date changed (creates new checkpoint)
- Manually update checkpoint status if needed:
  ```sql
  UPDATE archive_checkpoints
  SET status = 'in_progress'
  WHERE id = '<checkpoint-id>';
  ```

#### Duplicate Processing Detected

**Symptoms**: Same records appearing in multiple CSV files

**Diagnosis**:
```bash
# Check for duplicate IDs across CSV files
cat archives/*.csv | grep -v "^id," | cut -d',' -f1 | sort | uniq -d
```

**Solutions**:
- This should not happen due to cursor-based pagination
- If detected, stop archiving immediately
- Review checkpoint state and last processed ID
- Contact development team for investigation

#### Disk Space Exhausted

**Symptoms**: Archiving fails with "No space left on device"

**Solutions**:
- Use `MAX_BATCH` to limit files per run
- Compress and move existing CSV files to external storage
- Increase disk space allocation
- Use smaller `BATCH_SIZE` to create smaller files

## Performance Characteristics

### Throughput

- **Typical**: 500-1000 records/second
- **Batch Size Impact**: Larger batches = fewer transactions, higher throughput
- **Database Load**: Minimal impact with proper indexing

### Resource Usage

- **Memory**: ~50MB base + (batch_size * 2KB) per batch
- **Disk I/O**: Sequential writes to CSV, indexed reads from database
- **CPU**: Low (mostly I/O bound)

### Scaling Recommendations

| Records to Archive | Batch Size | Max Batch | Estimated Time |
|-------------------|------------|-----------|----------------|
| < 10,000 | 500 | unlimited | < 1 minute |
| 10,000 - 100,000 | 1000 | unlimited | 2-5 minutes |
| 100,000 - 1M | 2000 | 100 | 10-30 minutes |
| > 1M | 5000 | 200 | 1-2 hours |

## Safety Considerations

### Transactional Guarantees

- **Atomicity**: Each batch deletion + checkpoint update is atomic
- **Consistency**: Checkpoint always reflects actual database state
- **Isolation**: Row-level locks prevent concurrent modifications
- **Durability**: Checkpoint persisted before transaction commit

### Failure Scenarios

| Scenario | Impact | Recovery |
|----------|--------|----------|
| Process crash mid-batch | Last batch not deleted | Resume from checkpoint |
| Database connection lost | Transaction rolled back | Resume from checkpoint |
| Disk full during CSV write | CSV incomplete, no deletion | Free space, resume |
| Deployment during archiving | Process terminated | Resume from checkpoint |

### Data Integrity

- **No Data Loss**: Records only deleted after successful CSV write
- **Idempotent**: Re-running archiving is safe (skips already processed)
- **Verifiable**: CSV files can be validated against database before deletion

## Integration with Backup Systems

### S3 Upload Example

```bash
#!/bin/bash
# Archive and upload to S3

# Run archiving
DRY_RUN=false \
RAFFLE_EVENTS_RETENTION_DAYS=90 \
npm run archive:raffle-events

# Upload to S3
aws s3 sync ./archives/ s3://my-bucket/raffle-events-archives/ \
  --storage-class GLACIER \
  --exclude "*" \
  --include "*.csv"

# Cleanup local files after successful upload
rm -f ./archives/*.csv
```

### Automated Scheduling

```bash
# Cron job (daily at 2 AM)
0 2 * * * cd /app && DRY_RUN=false MAX_BATCH=50 npm run archive:raffle-events >> /var/log/archive.log 2>&1
```

## Testing

### Unit Tests

```bash
# Run archiving tests
npm test -- archive-raffle-events.spec.ts
```

### Integration Tests

```bash
# Test with real database (requires test DB)
npm run test:integration -- archive-raffle-events.integration.spec.ts
```

### Manual Testing Checklist

- [ ] Dry-run completes without errors
- [ ] CSV files created with correct format
- [ ] Checkpoint created and updated
- [ ] Resume works after interruption
- [ ] Max batch limit enforced
- [ ] No records deleted in dry-run mode
- [ ] Records deleted in production mode
- [ ] Checkpoint marked completed when done

## FAQ

**Q: Can I run archiving while the indexer is running?**  
A: Yes, archiving uses separate transactions and won't block ingestion.

**Q: What happens if I run archiving twice simultaneously?**  
A: The second run will wait for the first to complete (row-level lock on checkpoint).

**Q: Can I change retention days mid-archiving?**  
A: Yes, but it will create a new checkpoint and start fresh.

**Q: How do I restore archived data?**  
A: Use standard CSV import tools or write a custom import script.

**Q: What if I need to archive other tables?**  
A: The checkpoint system supports multiple job types. Extend the archiver for new tables.

**Q: Can I archive to S3 directly instead of local CSV?**  
A: Not currently, but you can pipe CSV output to S3 upload in a wrapper script.

## References

- [Archive Checkpoint Entity](../database/entities/archive-checkpoint.entity.ts)
- [Raffle Event Entity](../database/entities/raffle-event.entity.ts)
- [Archive Implementation](./archive-raffle-events.ts)
- [Archive Tests](./archive-raffle-events.spec.ts)

## Support

For issues or questions:
1. Check logs for error messages
2. Query checkpoint table for state
3. Review this guide for troubleshooting steps
4. Contact development team if issue persists
