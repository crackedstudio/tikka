# Raffle Events Retention Policy

**Command:** `npm run archive:raffle-events` (in `indexer/`)  
**Implementation:** `indexer/src/maintenance/archive-raffle-events.ts`  
**Table:** `raffle_events` (indexer PostgreSQL)

This document answers the operator question: *where did last year's events go, and how do I get them back?*

## Summary

| Question | Answer |
|---|---|
| **What is archived?** | Rows in `raffle_events` whose `indexed_at` is older than the retention window |
| **When?** | Only when an operator (or cron) runs `archive:raffle-events`; there is no automatic in-process purge |
| **Where do they go?** | Local CSV files under `./archives/` (relative to the process cwd), optionally synced to object storage |
| **Are they deleted from Postgres?** | Yes — after a successful CSV write for that batch — when `DRY_RUN=false` and deletion is confirmed |
| **How do I restore?** | Re-import the CSV files into `raffle_events` (procedure below) |

Archiving does **not** remove derived state (`raffles`, `tickets`, `users`, `platform_stats`). Those tables are updated by processors and are independent of the raw event log.

## Retention criteria

| Setting | Default | Meaning |
|---|---|---|
| `RAFFLE_EVENTS_RETENTION_DAYS` | `30` | Archive rows with `indexed_at < now() - N days` |

- Selection is ordered by `(indexed_at ASC, id ASC)` and processed in batches.
- Events still inside the retention window stay in Postgres.
- Changing `RAFFLE_EVENTS_RETENTION_DAYS` mid-job starts a new checkpoint when the cutoff no longer matches the previous run.

## Trigger cadence

The indexer does **not** schedule archiving itself. Recommended production cadence:

```cron
# Daily at 02:00 — archive in capped batches; requires explicit delete confirmation
0 2 * * * cd /app/indexer && \
  CONFIRM_DELETE=yes DRY_RUN=false MAX_BATCH=50 \
  npm run archive:raffle-events >> /var/log/archive-raffle-events.log 2>&1
```

Guidance:

- Prefer a low-traffic window.
- Use `MAX_BATCH` on the first large backfill so disk and lock duration stay bounded.
- Keep `DRY_RUN=true` (the default) for rehearsal; nothing is deleted.

## Destination (where archived data lives)

| Location | Details |
|---|---|
| **Primary** | `./archives/raffle_events_<cutoff-YYYY-MM-DD>_batchNNNN.csv` |
| **Filename date** | Cutoff date used for that run (ISO date of the retention threshold), not “today” |
| **Format** | CSV with header: `id,raffle_id,event_type,schema_version,ledger,tx_hash,payload_json,indexed_at` |
| **Optional durable copy** | Operators should sync `./archives/` to durable storage (S3/Glacier, NAS, backup volume) before discarding local files |

Example sync:

```bash
aws s3 sync ./archives/ s3://my-bucket/raffle-events-archives/ \
  --storage-class STANDARD_IA \
  --exclude "*" \
  --include "*.csv"
```

**If last year's events are missing from Postgres**, look first in:

1. The host/path that ran the archive job (`./archives/` on that machine).
2. The object-storage prefix used by your sync job.
3. Checkpoint history: `SELECT * FROM archive_checkpoints WHERE job_type = 'raffle_events' ORDER BY started_at DESC;`

## Safety confirmation (deletes)

Destructive runs require an extra confirmation beyond `DRY_RUN=false`:

| Mode | Behavior |
|---|---|
| `DRY_RUN` unset / not `false` | Dry run only — CSV may be written for preview; **no DB deletes** |
| `DRY_RUN=false` + interactive TTY | Prompts: type `yes` to continue |
| `DRY_RUN=false` + non-interactive (cron/CI) | Requires `CONFIRM_DELETE=yes` or the process aborts |
| `DRY_RUN=false CONFIRM_DELETE=yes` | Proceeds without a prompt (for automation) |

```bash
# Safe preview
npm run archive:raffle-events

# Interactive production run
DRY_RUN=false npm run archive:raffle-events

# Non-interactive / cron
CONFIRM_DELETE=yes DRY_RUN=false npm run archive:raffle-events
```

Each batch writes CSV first, then deletes those row IDs and updates `archive_checkpoints` in the same transaction.

## Restore procedure

Use this when you need historical `raffle_events` rows back in the indexer database (audit, re-processing, investigations).

### 1. Locate the archive files

```bash
# Local
ls -la ./archives/raffle_events_*.csv

# Or from object storage
aws s3 ls s3://my-bucket/raffle-events-archives/
aws s3 cp s3://my-bucket/raffle-events-archives/raffle_events_2025-01-15_batch0001.csv .
```

### 2. Staging import (recommended)

```sql
CREATE TABLE IF NOT EXISTS raffle_events_restore_staging (
  id UUID,
  raffle_id INTEGER,
  event_type VARCHAR(64),
  schema_version INTEGER,
  ledger INTEGER,
  tx_hash VARCHAR(64),
  payload_json JSONB,
  indexed_at TIMESTAMPTZ
);
```

```bash
# Load one CSV (psql \copy). Adjust path per file.
psql "$INDEXER_DATABASE_URL" -c "\copy raffle_events_restore_staging \
  (id, raffle_id, event_type, schema_version, ledger, tx_hash, payload_json, indexed_at) \
  FROM 'archives/raffle_events_2025-01-15_batch0001.csv' \
  WITH (FORMAT csv, HEADER true)"
```

### 3. Merge into `raffle_events`

`tx_hash` is unique. Use `ON CONFLICT DO NOTHING` so re-import is idempotent:

```sql
INSERT INTO raffle_events (
  id, raffle_id, event_type, schema_version, ledger, tx_hash, payload_json, indexed_at
)
SELECT
  id, raffle_id, event_type, COALESCE(schema_version, 1), ledger, tx_hash, payload_json, indexed_at
FROM raffle_events_restore_staging
ON CONFLICT (tx_hash) DO NOTHING;
```

Repeat for each batch CSV, then drop the staging table when finished:

```sql
DROP TABLE raffle_events_restore_staging;
```

### 4. Verify

```sql
SELECT COUNT(*) FROM raffle_events
WHERE indexed_at >= '2025-01-01' AND indexed_at < '2026-01-01';

SELECT id, event_type, tx_hash, indexed_at
FROM raffle_events
WHERE tx_hash = '<known-tx-hash-from-csv>';
```

### Notes on restore

- Restoring events does **not** automatically rebuild derived tables. If you need processors to re-run, coordinate with the indexer team (replay / reprocess paths).
- Prefer restoring into a staging or read-replica environment first when the volume is large.
- Keep archive CSVs under the same retention policy as database backups (see `docs/backups/`).

## Related configuration

| Variable | Default | Description |
|---|---|---|
| `RAFFLE_EVENTS_RETENTION_DAYS` | `30` | Age threshold (days) |
| `BATCH_SIZE` | `500` | Rows per batch |
| `MAX_BATCH` | unlimited | Cap batches per invocation |
| `DRY_RUN` | `true` | When not `false`, skip DB deletes |
| `CONFIRM_DELETE` | unset | Must be `yes` for non-interactive deletes |
| `RESUME` | `true` | Resume from `archive_checkpoints` when possible |

Optional code override: `outDir` in `ArchiveOptions` (CLI uses `./archives` under `process.cwd()`).

## Further reading

- Operator guide: [`indexer/src/maintenance/ARCHIVE_RAFFLE_EVENTS_GUIDE.md`](../../indexer/src/maintenance/ARCHIVE_RAFFLE_EVENTS_GUIDE.md)
- Quick commands: [`indexer/src/maintenance/ARCHIVE_QUICK_REF.md`](../../indexer/src/maintenance/ARCHIVE_QUICK_REF.md)
- Indexer README maintenance section: [`indexer/README.md`](../../indexer/README.md)
- Schema ownership: [`docs/database/README.md`](./README.md)
