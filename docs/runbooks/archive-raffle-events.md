# Runbook: Archive Raffle Events

## Overview

`raffle_events` is append-only and grows with every ingested contract event. The
`archive:raffle-events` maintenance script exports rows older than the retention
window to CSV and then deletes them from the database, in resumable batches.

This runbook covers running it in production, resuming an interrupted run, and
recovering from checkpoint integrity failures.

| | |
|---|---|
| **Command** | `npm run archive:raffle-events` (in `indexer/`) |
| **Entry point** | [`archive-raffle-events.ts`](../../indexer/src/maintenance/archive-raffle-events.ts) |
| **Default retention** | 30 days (`RAFFLE_EVENTS_RETENTION_DAYS`) |
| **Default mode** | Dry run — `DRY_RUN=false` is required to delete |
| **Output** | `indexer/archives/raffle_events_<cutoff>_batch<NNNN>.csv` |
| **Restore procedure** | [`docs/database/raffle-events-retention.md`](../database/raffle-events-retention.md) |

Nothing runs automatically: rows are only deleted when an operator or a cron job
invokes the script.

## Architecture

### Module layout

The archiver is split by responsibility under
[`indexer/src/maintenance/archive/`](../../indexer/src/maintenance/archive):

| Module | Responsibility |
|--------|----------------|
| `types.ts` | Options, results, and shared defaults |
| `logging.ts` | Structured JSON progress logs and integrity alerts |
| `integrity.ts` | Pure checkpoint hashing and verification |
| `checkpoint.service.ts` | `archive_checkpoints` row lifecycle |
| `batch-selector.ts` | Cursor-based row selection and deletion |
| `writer.ts` | CSV output |
| `confirmation.ts` | `CONFIRM_DELETE` gate for destructive runs |
| `runner.ts` | `archiveOldRaffleEvents` orchestration |
| `cli.ts` | Env parsing and process wiring |

`archive-raffle-events.ts` is a thin entry point: it re-exports the modules above
and invokes the CLI when executed directly, so the npm script path and any
programmatic imports are unchanged.

### Checkpoint state management

Progress is tracked in the `archive_checkpoints` table
([entity](../../indexer/src/database/entities/archive-checkpoint.entity.ts)):

```sql
CREATE TABLE archive_checkpoints (
  id UUID PRIMARY KEY,
  job_type VARCHAR(64),                     -- 'raffle_events'
  last_processed_timestamp TIMESTAMPTZ,     -- resume cursor
  last_processed_id UUID,                   -- tie-break for equal timestamps
  total_archived INTEGER,                   -- cumulative count
  batch_number INTEGER,                     -- current batch
  status VARCHAR(20),                       -- in_progress | completed | failed
  config_snapshot JSONB,                    -- run configuration
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  integrity_hash VARCHAR(64),               -- SHA-256 of canonical state
  last_verified_at TIMESTAMPTZ,
  verification_failure_reason VARCHAR(500)
);
```

A database table is used (rather than a file or Redis key) because checkpoint
updates then commit in the same transaction as the batch deletion, survive
container restarts, and stay inspectable via SQL.

### Resumption logic

1. Find the existing `in_progress` checkpoint for the job type.
2. Validate it was created for the current cutoff date; if not, close it and
   start a new one.
3. Verify the stored `integrity_hash` before doing any work (see below).
4. Resume from `last_processed_timestamp` + `last_processed_id`.
5. Update the checkpoint after each batch, in the deletion transaction.
6. Mark `completed` once no more rows match.

### Safety guarantees

- **No duplicate processing** — cursor pagination on `(indexed_at, id)`.
- **Atomic batches** — deletions and the cursor update share one transaction.
- **CSV before delete** — a crash mid-batch leaves rows in the database.
- **Confirmation gate** — destructive runs need a TTY `yes` or `CONFIRM_DELETE=yes`.
- **Integrity verification** — a tampered checkpoint halts the run instead of
  overwriting corrupt state.

## Usage

```bash
# 1. Dry run (default): writes CSVs, deletes nothing
npm run archive:raffle-events

# 2. Interactive destructive run: prompts for "yes"
DRY_RUN=false npm run archive:raffle-events

# 3. Non-interactive destructive run (cron, CI)
CONFIRM_DELETE=yes DRY_RUN=false npm run archive:raffle-events

# 4. Longer retention window
RAFFLE_EVENTS_RETENTION_DAYS=90 CONFIRM_DELETE=yes DRY_RUN=false npm run archive:raffle-events

# 5. Incremental archiving: 10 batches of 1000, then stop
BATCH_SIZE=1000 MAX_BATCH=10 CONFIRM_DELETE=yes DRY_RUN=false npm run archive:raffle-events

# 6. Ignore any existing checkpoint and start fresh
RESUME=false CONFIRM_DELETE=yes DRY_RUN=false npm run archive:raffle-events
```

Resuming needs no special flag — run the same command again and it continues
from the checkpoint.

### Environment variables

| Variable | Default | Effect |
|----------|---------|--------|
| `RAFFLE_EVENTS_RETENTION_DAYS` | `30` | Rows older than this are archivable |
| `BATCH_SIZE` | `500` | Rows per batch / per CSV file |
| `MAX_BATCH` | unlimited | Stop after N batches, leaving the checkpoint open |
| `DRY_RUN` | `true` | Only the exact string `false` enables deletion |
| `RESUME` | `true` | Only the exact string `false` ignores the checkpoint |
| `CONFIRM_DELETE` | unset | `yes` confirms deletion without a TTY prompt |

### Cron

```bash
# Daily at 02:00, at most 50 batches per night
0 2 * * * cd /app && CONFIRM_DELETE=yes DRY_RUN=false MAX_BATCH=50 npm run archive:raffle-events >> /var/log/archive.log 2>&1
```

## Detection

- **Logs**: every batch emits one JSON line on stdout.
  ```json
  {"timestamp":"2026-05-30T12:00:00.000Z","message":"Processing batch 5: 500 records","batchNumber":5,"totalArchived":2500,"currentBatchSize":500,"checkpointId":"abc-123"}
  ```
- **Health endpoint**: `GET /health` reports `archive_integrity` (`ok`,
  `failed`, or `no_checkpoint`) from
  [`archive-integrity-status.service.ts`](../../indexer/src/health/archive-integrity-status.service.ts).
- **Critical alert**: a checkpoint integrity mismatch emits this on stderr:
  ```json
  {"severity":"critical","alert":"archive_checkpoint_integrity_mismatch","checkpointId":"…","storedHash":"…","computedHash":"…"}
  ```
- **Exit codes**: `0` on success; `1` with a `{"message":"Archival failed",…}`
  line on stderr.

## Diagnosis

1. **Inspect recent checkpoints**:
   ```sql
   SELECT id, job_type, batch_number, total_archived, status,
          started_at, updated_at, last_verified_at, verification_failure_reason
   FROM archive_checkpoints
   WHERE job_type = 'raffle_events'
   ORDER BY started_at DESC
   LIMIT 5;
   ```
2. **Follow a live run**:
   ```bash
   npm run archive:raffle-events 2>&1 | jq -r '.message'
   ```
3. **Confirm what remains archivable**:
   ```sql
   SELECT count(*) FROM raffle_events
   WHERE indexed_at < now() - interval '30 days';
   ```
4. **Check the archive directory** has the expected `batchNNNN.csv` files and
   enough free disk space for the remaining batches.

## Mitigation

### Run aborted: deletion not confirmed

Expected for `DRY_RUN=false` without a TTY. Re-run with `CONFIRM_DELETE=yes`.

### Run interrupted (deploy, crash, network loss)

Re-run the same command. The checkpoint cursor guarantees no rows are
re-archived or skipped. Rows are only deleted after their CSV is written, so a
crash mid-batch at worst rewrites one CSV file.

### Checkpoint integrity verification failed

The run refuses to start, the checkpoint is marked `failed`, and the corrupt
`integrity_hash` is preserved as evidence. This means the checkpoint row was
modified outside the archiver.

1. Capture the row for the postmortem:
   ```sql
   SELECT * FROM archive_checkpoints WHERE id = '<checkpoint-id>';
   ```
2. Reconcile the cursor against the CSVs already on disk and against
   `raffle_events` to establish what was actually archived.
3. Once the true state is known, either correct the row and recompute its hash,
   or start clean with `RESUME=false` after confirming no rows would be skipped.

Legacy checkpoints written before integrity hashing was added have a null
`integrity_hash`; these are reported as `missing` and backfilled on the next
save rather than treated as a failure.

### Archiving is too slow or too heavy

Raise `BATCH_SIZE` for throughput, and cap `MAX_BATCH` so each window stays
bounded. Indicative figures:

| Records | Batch size | Max batch | Est. time |
|---------|------------|-----------|-----------|
| < 10K | 500 | unlimited | < 1 min |
| 10K–100K | 1000 | unlimited | 2–5 min |
| 100K–1M | 2000 | 100 | 10–30 min |
| > 1M | 5000 | 200 | 1–2 hours |

Resource usage is roughly `~50MB + (batch_size × 2KB)` of memory, sequential
disk writes, and indexed reads; the job is I/O bound.

### Archived data must be restored

Follow the restore procedure in
[`docs/database/raffle-events-retention.md`](../database/raffle-events-retention.md):
locate the CSVs, `\copy` into a staging table, then
`INSERT … ON CONFLICT (tx_hash) DO NOTHING`.

## Verification

1. **Checkpoint closed**: `status = 'completed'` with a `completed_at` for the
   run's checkpoint, or `in_progress` if `MAX_BATCH` stopped it early.
2. **Counts reconcile**: `total_archived` matches the summary line's
   `totalArchived` and the number of CSV rows written.
3. **Rows removed**: the archivable-count query above returns 0 (or only rows
   left over from a `MAX_BATCH` cap).
4. **Health is green**: `archive_integrity` is `ok` on `GET /health`.
5. **Archives are durable**: CSVs are backed up off the node (S3 or equivalent)
   before the volume is recycled.

## Operational checklist

**Before**: agree the retention window, check disk space, run a dry run, review
the current checkpoint, and schedule during low traffic.

**During**: watch the JSON logs and database load; confirm CSVs and checkpoint
updates are appearing.

**After**: verify counts, validate the CSVs, confirm the checkpoint status,
test a restore, and back the archives up.

## Package Mapping

- **Entry point**: [archive-raffle-events.ts](../../indexer/src/maintenance/archive-raffle-events.ts)
- **Modules**: [archive/](../../indexer/src/maintenance/archive)
- **Operator guide**: [ARCHIVE_RAFFLE_EVENTS_GUIDE.md](../../indexer/src/maintenance/ARCHIVE_RAFFLE_EVENTS_GUIDE.md)
- **Quick reference**: [ARCHIVE_QUICK_REF.md](../../indexer/src/maintenance/ARCHIVE_QUICK_REF.md)
- **Retention policy & restore**: [raffle-events-retention.md](../database/raffle-events-retention.md)
- **Checkpoint entity**: [archive-checkpoint.entity.ts](../../indexer/src/database/entities/archive-checkpoint.entity.ts)
- **Health indicator**: [archive-integrity-status.service.ts](../../indexer/src/health/archive-integrity-status.service.ts)
