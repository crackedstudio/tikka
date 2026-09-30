# #1588 — Duplicate Migration Timestamp Remediation

**Date:** 2026-09-28  
**Issue:** [#1588](../../)  
**Status:** Resolved

---

## Problem

`indexer/src/database/migrations/` contained two files with the identical
timestamp prefix `1770000000000`:

- `1770000000000-AuditHotPathIndexes.ts`
- `1770000000000-CreateWebhookDeadLetterDeliveries.ts`

TypeORM orders migrations by their numeric filename prefix. When two files share
a prefix, execution order falls back to filesystem read order, which is **not
guaranteed** across operating systems, container runtimes, or CI environments.
This is a latent ordering hazard.

### Dependency analysis

Neither migration has a schema dependency on the other:

| Migration | What it does | Dependencies |
|-----------|-------------|--------------|
| `CreateWebhookDeadLetterDeliveries` | Creates the `webhook_dead_letter_deliveries` table | None (brand-new table) |
| `AuditHotPathIndexes` | Adds indexes to `users`, `tickets`, `raffles`, `raffle_events`, `dead_letter_events` | All pre-existing tables (`dead_letter_events` is created at `1730000000000`, unrelated to `webhook_dead_letter_deliveries`) |

Despite no hard dependency, the correct idiomatic order is:
1. `CreateWebhookDeadLetterDeliveries` (create table) → `1770000000000`
2. `AuditHotPathIndexes` (add indexes to other tables) → `1770000000001`

---

## Resolution

`AuditHotPathIndexes` was renamed:

```
indexer/src/database/migrations/1770000000000-AuditHotPathIndexes.ts  →
indexer/src/database/migrations/1770000000001-AuditHotPathIndexes.ts
```

The class name and `name` field were updated accordingly:

```diff
- export class AuditHotPathIndexes1770000000000 implements MigrationInterface {
-   name = "AuditHotPathIndexes1770000000000";
+ export class AuditHotPathIndexes1770000000001 implements MigrationInterface {
+   name = "AuditHotPathIndexes1770000000001";
```

`CreateWebhookDeadLetterDeliveries` was left at `1770000000000` (no rename).

### Files changed

| File | Change |
|------|--------|
| `indexer/src/database/migrations/1770000000000-AuditHotPathIndexes.ts` | **Deleted** |
| `indexer/src/database/migrations/1770000000001-AuditHotPathIndexes.ts` | **Created** (renamed copy with updated class/name) |
| `indexer/scripts/check-migration-rollback.ts` | Added missing `RelaxTicketsPurchaseTxHashUnique1760000000001`, `CreateWebhookDeadLetterDeliveries1770000000000`, and `AuditHotPathIndexes1770000000001` imports and entries in `ALL_MIGRATIONS` |
| `indexer/src/test/integration/helpers/all-migrations.ts` | Updated import path and class name from `1770000000000` to `1770000000001` |
| `backend/scripts/check-migrations.ts` | Duplicate-timestamp check upgraded from **warning** to **error** |
| `docs/database/migration-timestamp-exceptions.md` | Updated to reflect resolved duplicate; added "Resolved duplicate timestamps" table |
| `docs/database/migration-conventions.md` | Note updated to mention duplicate-timestamp check is now an error |

---

## CI check improvement

`backend/scripts/check-migrations.ts` previously emitted a *warning* for
duplicate indexer timestamps in the legacy allow-list. As part of this fix:

1. The duplicate detection logic was rewritten to always emit an **error**
   (`result.valid = false`) for any duplicate timestamp — no exceptions.
2. `1770000000000` is no longer a duplicate, so no allow-list entry is needed
   for it.

From this point forward, any two files sharing a timestamp prefix will fail
`npm run migrations:check` in CI.

---

## Deployment checklist for environments with the old migration applied

If an environment already ran `AuditHotPathIndexes1770000000000` (i.e., the row
exists in the TypeORM `migrations` table), the record must be updated **before**
running `migration:run` with the renamed file. Otherwise TypeORM will attempt to
run `AuditHotPathIndexes1770000000001` as a brand-new migration on a database
where the indexes already exist — which is safe because all `up()` statements
use `CREATE INDEX IF NOT EXISTS`, but the stale row would remain forever.

### Step 1 — Check whether the old row exists

```sql
SELECT id, name, timestamp
FROM migrations
WHERE name = 'AuditHotPathIndexes1770000000000';
```

If this returns **zero rows**, no action is needed — proceed directly to
`migration:run`.

### Step 2 — Update the row (if it exists)

```sql
UPDATE migrations
SET name      = 'AuditHotPathIndexes1770000000001',
    timestamp = 1770000000001
WHERE name    = 'AuditHotPathIndexes1770000000000';
```

Run this in a transaction and verify one row was updated:

```sql
BEGIN;

UPDATE migrations
SET name      = 'AuditHotPathIndexes1770000000001',
    timestamp = 1770000000001
WHERE name    = 'AuditHotPathIndexes1770000000000';

-- Verify
SELECT id, name, timestamp FROM migrations WHERE timestamp IN (1770000000000, 1770000000001);

-- If the SELECT shows both expected rows correctly, commit; otherwise rollback.
COMMIT;
```

Expected post-update state:

| name | timestamp |
|------|-----------|
| `CreateWebhookDeadLetterDeliveries1770000000000` | `1770000000000` |
| `AuditHotPathIndexes1770000000001` | `1770000000001` |

### Step 3 — Run migrations as normal

```bash
npm run migration:run   # from indexer/
```

TypeORM will see both rows already recorded and skip both migrations. No
schema change occurs.

---

## Fresh-database behaviour

On a fresh database (staging reset, new developer environment, CI scratch DB):
TypeORM runs both migrations in the correct order — `1770000000000` first, then
`1770000000001` — with no manual intervention required.
