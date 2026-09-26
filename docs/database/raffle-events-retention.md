# Raffle Events Retention Policy

**Command:** `npm run archive:raffle-events` (in `indexer/`)  
**Implementation:** `indexer/src/maintenance/archive-raffle-events.ts` (modules in `indexer/src/maintenance/archive/`)  
**Runbook:** [`docs/runbooks/archive-raffle-events.md`](../runbooks/archive-raffle-events.md)  
**Table:** `raffle_events` (indexer PostgreSQL)

This document answers the operator question: *where did last year's events go, and how do I get them back?*

## Summary

| Question | Answer |
|---|---|
| **What is archived?** | Rows in `raffle_events` whose `indexed_at` is older than the retention window |
| **When?** | Only when an operator (or cron) runs `archive:raffle-events`; there is no automatic in-process purge |
| **Where do they go?** | Local CSV files under `./archives/` (relative to the process cwd), optionally synced to object storage |
| **Are they deleted from Postgres?** | Yes — after a successful CSV write for that batch — when `DRY_RUN=false` and deletion is confirmed |
| **How do I restore?** | `npm run restore:raffle-events` (`DRY_RUN=false`), which verifies each file's checksum before importing it — see [`restore-raffle-events.md`](../runbooks/restore-raffle-events.md) |

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
| **Checksum** | `./archives/raffle_events_<cutoff-YYYY-MM-DD>_batchNNNN.csv.sha256` — `sha256sum` format, written with the CSV and verified on restore |
| **Filename date** | Cutoff date used for that run (ISO date of the retention threshold), not “today” |
| **Format** | CSV with header: `id,raffle_id,event_type,schema_version,ledger,tx_hash,payload_json,indexed_at,contract_address` (archives written before `contract_address` was recorded have eight columns; restore accepts both) |
| **Optional durable copy** | Operators should sync `./archives/` to durable storage (S3/Glacier, NAS, backup volume) before discarding local files |

Example sync — include the sidecars (`*.csv*`), or a restore will have to import
unverified data:

```bash
aws s3 sync ./archives/ s3://my-bucket/raffle-events-archives/ \
  --storage-class STANDARD_IA \
  --exclude "*" \
  --include "*.csv*"
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

**Command:** `npm run restore:raffle-events` (in `indexer/`)
**Runbook:** [`docs/runbooks/restore-raffle-events.md`](../runbooks/restore-raffle-events.md)
**Implementation:** `indexer/src/maintenance/restore-raffle-events.ts` (modules in `indexer/src/maintenance/archive/`)

The restore CLI is the supported path: it verifies each archive’s `.sha256`
sidecar before importing and is idempotent (`ON CONFLICT (tx_hash) DO NOTHING`),
so a re-run can never duplicate rows.

### 1. Locate the archive files (and their sidecars)

```bash
# Local — the .sha256 file is required for a non-dry run
ls -la ./archives/raffle_events_*.csv*

# Or from object storage — pull the sidecar too
aws s3 ls s3://my-bucket/raffle-events-archives/
aws s3 cp s3://my-bucket/raffle-events-archives/ ./archives/ --recursive
```

### 2. Dry run (default)

```bash
npm run restore:raffle-events
```

Prints the files it would import, the rows it would insert, and the rows that
would be skipped as already present. Nothing is written.

### 3. Verify checksums and import

```bash
DRY_RUN=false npm run restore:raffle-events
```

Archives are read from `ARCHIVE_DIR` (default `./archives`); set it for a
directory elsewhere, or list exact files with `ARCHIVE_FILES`.

For every file the CLI:

1. Locates the `<file>.sha256` sidecar and asserts the on-disk digest matches
   (a missing or mismatched sidecar aborts the run — see below).
2. Parses the CSV strictly, rejecting malformed quoting, column counts that do
   not match the header, and unparseable timestamps.
3. Inserts rows in bulk with `ON CONFLICT (tx_hash) DO NOTHING`, reporting how
   many were inserted versus skipped.

Both the nine-column header and the legacy eight-column header (archives
written before `contract_address` was recorded) are accepted; a legacy file is
imported with `contract_address = NULL`.

### 4. Verify

```sql
SELECT COUNT(*) FROM raffle_events
WHERE indexed_at >= '2025-01-01' AND indexed_at < '2026-01-01';

SELECT id, event_type, tx_hash, indexed_at, contract_address
FROM raffle_events
WHERE tx_hash = '<known-tx-hash-from-csv>';
```

To restore a single file (for example after a partially failed batch), name it
in `ARCHIVE_FILES`:

```bash
ARCHIVE_FILES=archives/raffle_events_2025-01-15_batch0001.csv \
  DRY_RUN=false npm run restore:raffle-events
```

### Integrity failures

If a sidecar is missing or the digest does not match, the CLI exits non-zero
with an `ArchiveIntegrityError` and imports nothing from that file. Do **not**
delete or regenerate the sidecar to force an import — re-download the file and
its sidecar from durable storage, or restore the file from backup, and
investigate why the bytes changed. Restoring bytes that differ from what was
archived (or from what Postgres held) is exactly what the checksum exists to
prevent.

### Notes on restore

- Restoring events does **not** automatically rebuild derived tables. If you need processors to re-run, coordinate with the indexer team (replay / reprocess paths).
- Prefer restoring into a staging or read-replica environment first when the volume is large.
- Keep archive CSVs **and their `.sha256` sidecars** under the same retention policy as database backups (see `docs/backups/`).

## Related configuration

| Variable | Default | Description |
|---|---|---|
| `RAFFLE_EVENTS_RETENTION_DAYS` | `30` | Age threshold (days) |
| `BATCH_SIZE` | `500` | Rows per archive batch |
| `MAX_BATCH` | unlimited | Cap batches per invocation |
| `DRY_RUN` | `true` | When not `false`, skip DB deletes (archive) / skip inserts (restore) |
| `CONFIRM_DELETE` | unset | Must be `yes` for non-interactive archive deletes |
| `RESUME` | `true` | Resume archiving from `archive_checkpoints` when possible |
| `ARCHIVE_DIR` | `./archives` | Restore: directory scanned for `*.csv` archives |
| `ARCHIVE_FILES` | unset | Restore: comma-separated file list; overrides `ARCHIVE_DIR` |
| `RESTORE_BATCH_SIZE` | `500` | Restore: rows per `INSERT` statement |
| `ALLOW_UNVERIFIED_ARCHIVE` | unset | Restore: `yes` permits files with no `.sha256` sidecar |

Optional code override: `outDir` in `ArchiveOptions` (CLI uses `./archives` under `process.cwd()`).

## Further reading

- Operator guide: [`indexer/src/maintenance/ARCHIVE_RAFFLE_EVENTS_GUIDE.md`](../../indexer/src/maintenance/ARCHIVE_RAFFLE_EVENTS_GUIDE.md)
- Quick commands: [`indexer/src/maintenance/ARCHIVE_QUICK_REF.md`](../../indexer/src/maintenance/ARCHIVE_QUICK_REF.md)
- Archive runbook: [`docs/runbooks/archive-raffle-events.md`](../runbooks/archive-raffle-events.md)
- Restore runbook: [`docs/runbooks/restore-raffle-events.md`](../runbooks/restore-raffle-events.md)
- Indexer README maintenance section: [`indexer/README.md`](../../indexer/README.md)
- Schema ownership: [`docs/database/README.md`](./README.md)
