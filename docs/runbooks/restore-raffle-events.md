# Runbook: Restore Archived Raffle Events

## Overview

`archive:raffle-events` exports old `raffle_events` rows to CSV and then **deletes
them from the database**. This is the executable inverse: it verifies each
archive's checksum, parses the CSV, and inserts the rows back.

An archive is only as good as its restore path, so this procedure is covered by
`src/test/integration/archive-restore.integration.spec.ts`, which archives a
range, deletes it, restores it, and asserts the rows are byte-identical to what
was archived.

| | |
|---|---|
| **Command** | `npm run restore:raffle-events` (in `indexer/`) |
| **Entry point** | [`restore-raffle-events.ts`](../../indexer/src/maintenance/restore-raffle-events.ts) |
| **Input** | `ARCHIVE_DIR` (default `./archives`) → `raffle_events_<cutoff>_batchNNNN.csv` + `.sha256` |
| **Default mode** | Dry run — `DRY_RUN=false` is required to write rows |
| **Writes** | `raffle_events` only, and only rows that are missing |
| **Safe to re-run** | Yes — `ON CONFLICT DO NOTHING`, per file, in one transaction |

Restoring is **additive**: it never deletes or updates a row, and a row that is
already present is left exactly as it is. There is no confirmation prompt for
that reason; the checksum check is the gate.

## How it works

### 1. Verify, then parse, then insert

For every file, in order:

1. **Verify** — re-read `<file>.sha256` and compare it with the SHA-256 of the
   bytes on disk. A mismatch (edited, truncated, or half-synced file) aborts the
   file before it is even parsed.
2. **Parse** — validate the header, column count, UUIDs, integers, JSON payload
   and timestamps. The first problem reported includes the line number.
3. **Insert** — one transaction per file:
   `INSERT INTO raffle_events (…) VALUES (…) ON CONFLICT DO NOTHING RETURNING id`.
   The conflict target is deliberately unqualified so both the `tx_hash`
   idempotency key and the `id` primary key make a re-run a no-op.

A file either restores completely or not at all. Everything already restored
stays restored, so after fixing the problem file you re-run the same command.

### 2. Archive format

Header written today (the last column was added when this runbook's tooling
landed — archives without it restore with a NULL contract address):

```
id,raffle_id,event_type,schema_version,ledger,tx_hash,payload_json,indexed_at,contract_address
```

| File | Contents |
|---|---|
| `raffle_events_<cutoff>_batchNNNN.csv` | One row per archived event, plus a header |
| `raffle_events_<cutoff>_batchNNNN.csv.sha256` | `<sha256>  <basename>`, `sha256sum` format |

`id` and `indexed_at` are restored **verbatim**: an archive is a copy of the
table, not a re-ingest, so the row keeps its original primary key and its
original position in the timeline.

### 3. Module layout

| Module | Responsibility |
|--------|----------------|
| `checksum.ts` | SHA-256 sidecar write/verify (`verifyArchiveChecksum`, `assertArchiveChecksum`) |
| `restore.ts` | CSV parsing, insert SQL, per-file restore orchestration |
| `restore-cli.ts` | Env parsing, file discovery, process wiring |
| `logging.ts` | `event: "archive_restore"` JSON progress lines |

## Usage

```bash
# 1. Dry run (default): verifies and parses every file, writes nothing
npm run restore:raffle-events

# 2. Restore everything in ./archives
DRY_RUN=false npm run restore:raffle-events

# 3. Restore one batch (under pressure: bring back exactly one file)
ARCHIVE_FILES=archives/raffle_events_2026-01-15_batch0003.csv \
  DRY_RUN=false npm run restore:raffle-events

# 4. Restore an archive directory that is not ./archives
ARCHIVE_DIR=/mnt/backups/raffle-events DRY_RUN=false npm run restore:raffle-events

# 5. Archive produced before checksum sidecars existed (see the warning below)
ALLOW_UNVERIFIED_ARCHIVE=yes DRY_RUN=false npm run restore:raffle-events

# 6. Pull the archives from object storage first, then restore
aws s3 sync s3://my-bucket/raffle-events-archives/ ./archives/ --exclude "*" --include "*.csv*"
DRY_RUN=false npm run restore:raffle-events
```

### Environment variables

| Variable | Default | Effect |
|----------|---------|--------|
| `ARCHIVE_DIR` | `./archives` | Directory scanned for `*.csv`, restored in filename order |
| `ARCHIVE_FILES` | unset | Comma-separated file list; overrides `ARCHIVE_DIR` |
| `DRY_RUN` | `true` | Only the exact string `false` enables writes |
| `RESTORE_BATCH_SIZE` | `500` | Rows per `INSERT` statement |
| `ALLOW_UNVERIFIED_ARCHIVE` | unset | `yes` permits files with no `.sha256` sidecar |

### Output

Two JSON lines on stdout, plus one progress line per file:

```json
{"timestamp":"…","message":"Starting raffle events restore","config":{"dir":"/app/indexer/archives","files":3,"dryRun":false,"batchSize":500,"allowMissingChecksum":false}}
{"timestamp":"…","event":"archive_restore","message":"Restored /app/indexer/archives/raffle_events_2026-01-15_batch0001.csv: 500 inserted, 0 already present","rowsRead":500,"rowsInserted":500,"rowsAlreadyPresent":0,"dryRun":false}
{"timestamp":"…","message":"Restore completed","result":{"dryRun":false,"filesProcessed":3,"rowsRead":1240,"rowsInserted":1240,"rowsAlreadyPresent":0,"wouldInsert":1240}}
```

`rowsAlreadyPresent` is why a second run is not a problem: it counts rows the
database already had, and `wouldInsert` is `rowsRead - rowsAlreadyPresent`.

Exit codes: `0` on success; `1` with `{"message":"Restore failed","error":"…"}`
on stderr.

## Detection

Nothing to detect while it runs, but before and after:

- Confirm what is on disk and that the checksums are intact:

  ```bash
  cd indexer/archives && sha256sum -c *.csv.sha256
  ```

- Confirm what the database currently holds for the period:

  ```sql
  SELECT count(*), min(indexed_at), max(indexed_at)
  FROM raffle_events
  WHERE indexed_at < now() - interval '30 days';
  ```

- Confirm nothing was duplicated (also enforced by the unique index):

  ```sql
  SELECT tx_hash, count(*) FROM raffle_events
  GROUP BY tx_hash HAVING count(*) > 1;
  ```

- Health endpoint: `GET /health` should still report `archive_integrity: ok`
  (the checkpoint is untouched by a restore).

## Diagnosis

### Dry run reports `wouldInsert: 0` for a file you know is missing

The rows are already there — most likely a previous restore of the same file.
Confirm with the count query above; do not force anything.

### `Refusing to read archive … Archive contents do not match the recorded SHA-256`

The bytes on disk are not the bytes the archiver wrote. Most common causes, in
order: a partial object-storage sync, a transfer that re-encoded line endings, or
a hand edit. Do **not** regenerate the sidecar to make it pass.

1. Look for another copy of the same file (the archive host, S3, backup volume)
   and compare sizes and `sha256sum` output between them.
2. If the database rows for that batch are still missing and no intact copy
   exists, treat it as data loss, not as a restore problem: the CSV is the only
   copy, so escalate rather than editing it.
3. Never "fix" a CSV by hand. If a single row is corrupt the whole file is
   untrusted, because the sidecar covers the file as a whole.

### `Refusing to read archive … No readable SHA-256 sidecar`

The CSV exists but its sidecar does not (an archive from before checksums, or a
sync that only copied `*.csv`). Two options:

- Preferred: find and copy the matching `.sha256` file, then re-run.
- If you are certain the CSV is the original (for example, it verifies against a
  byte count and row count you can independently confirm), re-run with
  `ALLOW_UNVERIFIED_ARCHIVE=yes`. The run logs a `WARNING: … importing
  unverified` line for every such file — keep that line with the change record.

### `Unexpected archive header` / `Expected N columns, found M` / `… (line 42)`

The file is not an archive this tool wrote (wrong file, concatenated files, or a
hand edit). The message names the line. Restore the file from durable storage
rather than repairing it; the archiver writes these files, operators do not.

### Restore is slow on a large history

Each file is one transaction; `RESTORE_BATCH_SIZE` controls the statement size.
The insert is a bulk `INSERT … ON CONFLICT` against an indexed table, so a
100k-row restore is seconds, not minutes. Lower `RESTORE_BATCH_SIZE` only if
statement size or lock duration becomes a problem, and restore in a
low-traffic window for very large volumes.

## Mitigation

### The restore stopped partway

Files are independent: the summary shows `filesProcessed` before the failure.
Fix or remove the offending file (see above) and re-run the same command — the
already-restored files report `rowsInserted: 0`.

### Rows came back but the application still looks wrong

Restoring `raffle_events` does **not** rebuild derived state (`raffles`,
`tickets`, `users`, `platform_stats`). Those tables are processor outputs; if
they need to catch up, coordinate with the indexer team for a replay or
reprocess, and check the checkpoint in `indexer_cursor` before doing so.

### A restore must be undone

There is no "un-restore" command, because restoring is not a mutation of
existing state. Delete the specific rows you restored, by id or by the archive's
`tx_hash` values, and only after confirming they are still the archived copy:

```sql
-- Preview first: these ids should match the CSV you restored
SELECT id, tx_hash, indexed_at FROM raffle_events
WHERE tx_hash IN ('tx-1', 'tx-2');
```

## Verification

After a restore, before closing the incident:

1. **Dry run was clean** — `wouldInsert` matched what you expected.
2. **Counts reconcile** — `rowsInserted` matches the row count in the CSVs
   (`wc -l` minus one header line per file), and `rowsAlreadyPresent` is
   explained.
3. **Spot-check a row** — pick a `tx_hash` from a CSV and confirm the row's
   `id`, `indexed_at` and `payload_json` match the file.
4. **No duplicates** — the `GROUP BY tx_hash HAVING count(*) > 1` query returns
   nothing.
5. **Checkpoint unaffected** — `archive_integrity` is `ok` on `GET /health`.
6. **Archives untouched** — `sha256sum -c *.csv.sha256` still passes; a restore
   never rewrites an archive.

## Operational checklist

**Before**: know which cutoff/batch you are restoring and why, make sure the
archives are the durable copies (not a partial sync), run the dry run, and check
whether those rows are still missing from the database.

**During**: watch the per-file JSON lines; `rowsInserted` should be non-zero for
the files you expect to matter.

**After**: run the verification list above, note the restore and the reason in
the change record, and confirm the health endpoint is still green.

## Package Mapping

- **Entry point**: [restore-raffle-events.ts](../../indexer/src/maintenance/restore-raffle-events.ts)
- **Modules**: [archive/restore.ts](../../indexer/src/maintenance/archive/restore.ts), [archive/checksum.ts](../../indexer/src/maintenance/archive/checksum.ts), [archive/restore-cli.ts](../../indexer/src/maintenance/archive/restore-cli.ts)
- **Archive runbook**: [archive-raffle-events.md](./archive-raffle-events.md)
- **Retention policy**: [raffle-events-retention.md](../database/raffle-events-retention.md)
- **Round-trip test**: [archive-restore.integration.spec.ts](../../indexer/src/test/integration/archive-restore.integration.spec.ts)
