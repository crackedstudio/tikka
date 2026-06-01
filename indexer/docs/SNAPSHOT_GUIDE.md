# Indexer Snapshot Guide

This guide details the contract and workflow for creating and importing indexer database snapshots.

## Snapshot Contract

Snapshots are exported as gzip-compressed JSON files containing both metadata (the manifest) and the raw data.

### 1. Snapshot Wrapper

The root of the uncompressed JSON file contains two main properties:

```json
{
  "manifest": { ... },
  "data": { ... }
}
```

### 2. Manifest Schema (`SnapshotManifest`)

The manifest contains metadata used for validating the integrity and compatibility of the snapshot before it is applied to the database.

- **`schemaVersion`**: `string` — The expected schema version (e.g., `"1.0.0"`). Must match the current application version.
- **`exportedAt`**: `string` — ISO8601 timestamp of when the export occurred.
- **`ledgerRange`**: `object` — Contains `min` (usually 0) and `max` indicating the latest ledger processed in this snapshot (based on `IndexerCursorEntity`).
- **`entityCounts`**: `object` — Contains exact counts of arrays in the data payload:
  - `raffles`: `number`
  - `tickets`: `number`
  - `users`: `number`
- **`checksum`**: `string` — SHA-256 hash of the stringified `data` object to ensure it hasn't been corrupted.

### 3. Data Schema (`SnapshotData`)

Contains the raw entity arrays:
- `raffles`: Array of `RaffleEntity`
- `tickets`: Array of `TicketEntity`
- `users`: Array of `UserEntity`
- `cursor`: The `IndexerCursorEntity` state (or `null`)

## Usage

### Dry-run Import

You can execute a dry-run to safely validate a snapshot against the current schema and check its integrity, without writing anything to the database:

```typescript
// The second parameter (dryRun) is set to true
const manifest = await snapshotService.importSnapshot("snapshot-file.json.gz", true);
console.log(manifest);
```

During a dry-run, the service will:
1. Download and decompress the file from S3.
2. Validate `schemaVersion`.
3. Validate the `checksum` against the uncompressed data.
4. Validate that array lengths exactly match `entityCounts`.
5. Return the manifest and abort before opening a database transaction.

### Full Import

To actually restore the state, pass `false` or omit the `dryRun` flag. The service will perform the same validations, clear existing tables (respecting foreign key relationships), and restore all data within a single transaction.
