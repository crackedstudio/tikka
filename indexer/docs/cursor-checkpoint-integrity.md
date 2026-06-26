# Cursor Checkpoint Integrity

## Checkpoint Fields

| Field               | Type   | Invariant                                      |
|---------------------|--------|------------------------------------------------|
| sequence            | number | Strictly increasing across saves               |
| ledgerHash          | string | Must match chain-reported hash for this seq    |
| processedEventCount | number | Monotonically non-decreasing                   |
| savedAt             | string | Valid ISO-8601                                 |
| version             | number | Must equal `CURSOR_CHECKPOINT_VERSION`         |

## Integrity Checks

- **Before every save**: sequence monotonicity, event count monotonicity,
  field presence, version match.
- **On startup load**: structural validity, version match.
- **After ledger fetch**: ledger hash compared against stored hash.

## Violation Codes

| Code                     | Trigger                                        | Action         |
|--------------------------|------------------------------------------------|----------------|
| `SEQUENCE_REGRESSION`    | New seq < previous seq                         | → DEGRADED     |
| `SEQUENCE_DUPLICATE`     | New seq == previous seq                        | → DEGRADED     |
| `HASH_MISMATCH`          | Chain hash != stored hash                      | → DEGRADED     |
| `EVENT_COUNT_REGRESSION` | New count < previous count                     | → DEGRADED     |
| `INVALID_SAVED_AT`       | `savedAt` not parseable as ISO-8601            | → DEGRADED     |
| `VERSION_MISMATCH`       | Stored version != current version              | → DEGRADED     |
| `MISSING_REQUIRED_FIELD` | Required field absent in stored state          | → DEGRADED     |
| `CORRUPTED_CHECKPOINT`   | Stored value is not a valid checkpoint object  | → DEGRADED     |

## DEGRADED Mode

When any violation is detected, the indexer transitions to DEGRADED mode:

- No further ledger processing or storage writes occur.
- The status command reports `mode: "DEGRADED"` and the triggering violation code.
- Operator must investigate the stored checkpoint and either:
  - Fix the underlying cause and reset the checkpoint to a known-good state, or
  - Run the provided reset tool (if available) to restart from a safe sequence.

**Why DEGRADED must block all writes:** a degraded indexer that continues writing
can produce a checkpoint that looks structurally valid but represents a forked or
corrupted chain state. Once such a checkpoint is persisted, recovery requires
replaying from a much earlier sequence — or manual DB surgery — rather than a
clean restart from the last known-good ledger. Blocking writes on the first
violation keeps the last good checkpoint intact and makes recovery deterministic.

## Operator Recovery

```bash
# Check current checkpoint and violation detail:
npm run status

# To reset to a known-good sequence (destructive — use with care):
# <document the reset command if one exists, or note it is a future task>
```

## Schema Versioning

`CURSOR_CHECKPOINT_VERSION` is incremented on every structural change to
`CursorCheckpoint`. A version mismatch on load transitions to DEGRADED to prevent
a new indexer binary from silently misreading an old checkpoint format.
