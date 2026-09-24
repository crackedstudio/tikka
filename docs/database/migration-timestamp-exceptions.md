# Indexer Migration Timestamp Exceptions

> Historical record for `indexer/src/database/migrations/`. Read this alongside
> [migration-conventions.md](migration-conventions.md) §2.3.

## Background

TypeORM executes indexer migrations in the order of their numeric filename
prefix (the millisecond epoch timestamp). That ordering is only correct when
the timestamp reflects the real time the migration was generated. Two naming
schemes were mixed in this directory:

- **Hand-written sequential placeholders** — round "base" timestamps with
  fabricated sub-sequences, e.g. `1700000000000-CreateRaffles.ts` through
  `1700000000006-CreatePlatformState.ts`, then the `1720000000000`,
  `1730000000000`, `1750000000000`, `1760000000000`, and `1770000000000`
  blocks.
- **Real generated timestamps** — produced by
  `pnpm --filter indexer migration:generate` from `Date.now()`, e.g.
  `1748589373000-CreateArchiveCheckpoints.ts`,
  `1748736000000-AddCheckpointIntegrityColumns.ts`,
  `1748900000000-AddArchiveCheckpointIntegrityFields.ts`.

The danger: because the sort key is the numeric prefix, a genuine migration
generated later can sort *before* a placeholder that was hand-set to a larger
round number — purely by luck of the numbers chosen, not by design.

## Policy going forward

New indexer migrations **must** use a real generated timestamp. Never hand-edit
or round the timestamp. The lint in `backend/scripts/check-migrations.ts`
rejects round-number placeholder timestamps in any new file (see
`migration-conventions.md` §2.3 for the exact rule).

## Why applied migrations were not renumbered

Per the migration task, applied migrations are never renumbered — doing so would
desynchronise TypeORM's `migrations` history table on every environment that has
already run these files. The placeholder files below are therefore kept as-is
and recorded here as the sanctioned historical exception.

### Sanctioned legacy placeholder timestamps

These base timestamps are allow-listed in the lint so the existing files keep
passing; any *new* file using a placeholder timestamp (a timestamp divisible by
`10_000_000`) is rejected:

| Timestamp base      | Files |
|---------------------|-------|
| `1700000000000`     | `1700000000000-CreateRaffles` … `1700000000006-CreatePlatformState` (7 files) |
| `1720000000000`     | `1720000000000-AddWebhooksTable` … `1720000000003-AddSchemaVersionToRaffleEvents` (4 files) |
| `1730000000000`     | `1730000000000-CreateDeadLetterEvents`, `1730000000001-AddLedgerHashesToCursor` |
| `1750000000000`     | `1750000000000-AddRaffleEventIndexes`, `1750000000001-BackfillSchemaVersions` |
| `1760000000000`     | `1760000000000-CreateWebhookDeliveries`, `1760000000001-RelaxTicketsPurchaseTxHashUnique` |
| `1770000000000`     | `1770000000000-AuditHotPathIndexes`, `1770000000000-CreateWebhookDeadLetterDeliveries` |

### Known duplicate timestamp (also a historical exception)

`1770000000000-AuditHotPathIndexes.ts` and
`1770000000000-CreateWebhookDeadLetterDeliveries.ts` share the same prefix. This
is a latent ordering hazard (TypeORM falls back to stable file order for equal
timestamps). Both migrations are independent of each other and of any later file,
so it is harmless today. Future migrations must not reuse an existing timestamp.

## Ordering audit against the dependency graph

Run at the time these exceptions were recorded, every migration was checked to
confirm it only references tables/columns created by a migration that sorts
*before* it. Result: **no migration depends on a migration that sorts after
it** — the current order is safe to apply from a clean database.

| Migration (prefix) | Touches | Created by (prefix) | OK? |
|--------------------|---------|---------------------|-----|
| `1700000000001-CreateTickets` | `raffles` (FK) | `1700000000000` | ✅ |
| `1720000000001-AddUserLastTxHash` | `users` | `1700000000002` | ✅ |
| `1720000000002-AddWinningTicketId` | `raffles` | `1700000000000` | ✅ |
| `1720000000003-AddSchemaVersionToRaffleEvents` | `raffle_events` | `1700000000003` | ✅ |
| `1730000000001-AddLedgerHashesToCursor` | `indexer_cursor` | `1700000000005` | ✅ |
| `1748736000000-AddCheckpointIntegrityColumns` | `indexer_cursor` | `1700000000005` | ✅ |
| `1748900000000-AddArchiveCheckpointIntegrityFields` | `archive_checkpoints` | `1748589373000` | ✅ |
| `1750000000000-AddRaffleEventIndexes` | `raffle_events` | `1700000000003` | ✅ |
| `1750000000001-BackfillSchemaVersions` | `raffle_events.schema_version` | `1720000000003` | ✅ |
| `1760000000001-RelaxTicketsPurchaseTxHashUnique` | `tickets` | `1700000000001` | ✅ |
| `1770000000000-AuditHotPathIndexes` | `users`, `tickets`, `raffles`, `raffle_events`, `dead_letter_events` | all earlier | ✅ |
| `1770000000000-CreateWebhookDeadLetterDeliveries` | new table only | — | ✅ |

The remaining migrations create brand-new tables and have no forward
dependency.
