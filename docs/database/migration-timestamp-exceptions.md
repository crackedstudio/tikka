# Indexer Migration Timestamp Exceptions

> Historical record for `indexer/src/database/migrations/`, plus the one
> `backend/database/migrations/` sequence collision resolved with it. Read
> alongside [migration-conventions.md](migration-conventions.md) §2.3 (indexer)
> and §2.1 (backend).

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
| `1770000000000`     | `1770000000000-CreateWebhookDeadLetterDeliveries` (the `AuditHotPathIndexes` file was renumbered — see below) |

### Resolved duplicate timestamp: `1770000000000`

`1770000000000-AuditHotPathIndexes.ts` and
`1770000000000-CreateWebhookDeadLetterDeliveries.ts` shared one prefix. The two
were unrelated — `AuditHotPathIndexes` touches `users`, `tickets`, `raffles`,
`raffle_events` and `dead_letter_events`, all created by earlier migrations, and
neither references the other's table — but the tie still left their relative
order to directory read order, which is not stable across filesystems.

`AuditHotPathIndexes` was renumbered to a real generated timestamp
(`1790249299096-AuditHotPathIndexes`), so it sorts deterministically after the
webhook dead-letter table. Every statement in it is `IF NOT EXISTS` / `IF EXISTS`,
so applying it later is safe on any environment. A deployment that already
recorded the old name in TypeORM's history table should reconcile it:

```sql
UPDATE migrations
   SET name = 'AuditHotPathIndexes1790249299096'
 WHERE name = 'AuditHotPathIndexes1770000000000';
```

Without that update the renamed file looks unapplied and TypeORM runs it again —
harmless here because of the idempotent statements, but the history table should
not keep pointing at a name that no longer exists in the tree.

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
| `1790249299096-AuditHotPathIndexes` | `users`, `tickets`, `raffles`, `raffle_events`, `dead_letter_events` | all earlier | ✅ |
| `1770000000000-CreateWebhookDeadLetterDeliveries` | new table only | — | ✅ |

The remaining migrations create brand-new tables and have no forward
dependency.

## Backend (Supabase SQL): duplicate sequence `014`

`backend/database/migrations/` uses the sequential `NNN_name.sql` scheme, where
`migration-conventions.md` §2.1 requires one file per number and no gaps. Three
files were committed with a `014_` prefix, which
`backend/scripts/check-migrations.ts` reports as both a duplicate sequence and a
gap:

| File | Now |
|------|-----|
| `014_notification_preferences.sql` | kept at `014_` (first alphabetically) |
| `014_support_tickets.sql` | `016_support_tickets.sql` |
| `014_webhook_atomic_increment.sql` | `017_webhook_atomic_increment.sql` |

The three are independent — a preferences table, a support-ticket table, and the
`increment_webhook_failure_count` function over `webhooks` — and no later
migration references any of their objects, so moving two of them into free
numbers leaves every dependency satisfied. `015_webhook_dead_letters.sql` stays
where it is.

An environment that already applied the old names should reconcile the record
Supabase keeps before the next `db push`:

```sql
UPDATE supabase_migrations.schema_migrations
   SET version = '016'
 WHERE version = '014' AND name = 'support_tickets';

UPDATE supabase_migrations.schema_migrations
   SET version = '017'
 WHERE version = '014' AND name = 'webhook_atomic_increment';
```

Both statements are idempotent, and the migration SQL itself only uses
`CREATE TABLE IF NOT EXISTS` / `CREATE OR REPLACE FUNCTION` / `CREATE INDEX IF
NOT EXISTS`, so re-applying is safe. Three documents under `docs/archive/` still
name the old filename; they are historical records and were deliberately left
untouched.
