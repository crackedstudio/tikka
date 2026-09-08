# Database Migration Conventions

This document defines the migration naming, sequencing, and review conventions
for every database in the Tikkа platform. It also explains how the `db/`
directory relates to Supabase-managed migrations and what must happen before a
destructive schema change lands in production.

---

## 1. Where Each Schema Lives

| Database Instance      | Services                  | Access Method                          |
|------------------------|---------------------------|----------------------------------------|
| Supabase (shared PG)   | `tikka-backend`, `tikka-oracle` | `@supabase/supabase-js` + `service_role_key` |
| Indexer PostgreSQL     | `tikka-indexer`           | TypeORM via `@nestjs/typeorm`          |

**Important:** The backend and oracle share the same Supabase PostgreSQL
instance. The indexer has its own dedicated database. The backend **never**
queries the indexer database directly — it consumes the indexer's HTTP REST API.

### Migration directories

| Service         | Directory                               | ORM / format                 |
|-----------------|------------------------------------------|------------------------------|
| `tikka-backend` | `backend/database/migrations/`           | Raw `.sql` (Supabase)        |
| `tikka-indexer` | `indexer/src/database/migrations/`       | TypeORM classes (`.ts`)      |
| `tikka-oracle`  | `oracle/database/migrations/`            | Raw `.sql` (Supabase)        |

---

## 2. Migration Naming Conventions

### 2.1 Backend (Supabase SQL)

```
NNN_descriptive_snake_case_name.sql
```

| Rule                     | Example ✅                              | Anti-pattern ❌          |
|--------------------------|------------------------------------------|--------------------------|
| 3-digit zero-padded seq  | `001_raffle_metadata.sql`               | `1_raffle_metadata.sql`  |
| snake_case name          | `010_soft_delete_raffle_metadata.sql`   | `010-SoftDelete.sql`     |
| No gaps in numbering     | `001, 002, 003 …`                       | `001, 002, 004`          |
| No duplicate sequences   | One file per `NNN_`                    | Two files both `008_`    |
| `.sql` extension         | `012_notification_subscriptions.sql`    | `012_notifs.ts`          |

Run `npm run migrations:check` (from `backend/`) to validate all rules before
committing.

### 2.2 Oracle (Supabase SQL)

```
NNN_descriptive_snake_case_name.sql
```

Same rules as backend, **plus** every migration must be **idempotent**:

```sql
-- ✅ GOOD
CREATE TABLE IF NOT EXISTS vrf_audit_log (
  id BIGSERIAL PRIMARY KEY,
  ...
);

-- ❌ BAD (will fail on re-run)
CREATE TABLE vrf_audit_log (...);
```

Oracle runbooks are in `oracle/database/migrations/README.md`.  Use the
`verify-schema.ts` script to confirm the schema exists after applying.

### 2.3 Indexer (TypeORM)

```
<timestamp>-<PascalCaseName>.ts
```

| Rule                          | Example ✅                                                    |
|-------------------------------|---------------------------------------------------------------|
| Timestamp prefix (ms epoch)   | `1748589373000-CreateArchiveCheckpoints.ts`                  |
| Real generated timestamp      | **Never** hand-write or round the timestamp — see below      |
| PascalCase class name         | `1748589373000-CreateArchiveCheckpoints.ts`                  |
| Export a class implementing   | `class CreateArchiveCheckpoints1748589373000 implements MigrationInterface` |
| `up()` and `down()`           | Both methods must be implemented                              |
| Transaction mode              | `transaction: 'each'` recommended                             |

#### Timestamp rule (mandatory)

TypeORM runs indexer migrations in ascending order of the numeric filename
prefix. That order is only correct when the prefix is a **real generation
timestamp**. Therefore:

- **Always** create migrations with the generator:
  `pnpm --filter indexer migration:generate -n <Name>`.
  The timestamp comes from `Date.now()` and reflects the real creation time.
- **Never** hand-edit, round, or space out the timestamp (no `1700000000000`,
  `1720000000000`, … style placeholders). A fabricated round number can sort
  after a later-but-smaller real timestamp, silently inverting execution order.
- **Never** reuse an existing timestamp for a new migration.

A lint step in `backend/scripts/check-migrations.ts` rejects any new indexer
migration whose timestamp is a round number (divisible by `1_000_000_000`). A set
of legacy placeholder timestamps already committed to this directory is
allow-listed there as a recorded historical exception — see
[migration-timestamp-exceptions.md](migration-timestamp-exceptions.md). Do not
add new files to that allow-list.

**Critical:** Every migration **must** be appended to the ordered migration
lists in:

- `indexer/scripts/check-migration-rollback.ts` → `ALL_MIGRATIONS`
- `indexer/src/test/integration/helpers/all-migrations.ts` → `ALL_INDEXER_MIGRATIONS`

If you forget, the rollback check and drift check will fail in CI.

---

## 3. How `db/` Relates to Supabase Migrations

The `db/` directory at the repo root is a **shared operational home** for
cross-cutting database concerns:

```
db/
├── OPERATIONAL.md         # DB team ownership, dashboards, runbooks
└── (future: drift baselines, backup scripts)
```

It does **not** contain migration files.  Actual migrations live inside each
service's directory (see §1).  The `db/` directory answers questions like:

- Who is on-call for the database?
- Where do I find replication lag dashboards?
- How do I restore from a backup?

### Supabase-specific workflow

1. Create a migration in `backend/database/migrations/` or
   `oracle/database/migrations/`.
2. Test locally against a Supabase CLI instance (`supabase start`).
3. Apply in staging via CI/CD (`supabase db push` or `psql`).
4. Apply in production via the same CI/CD pipeline.

**Never** apply Supabase migrations manually via the dashboard in production.
All DDL changes must flow through code-reviewed migration files in this repo.

---

## 4. Review Requirements for Destructive Changes

A **destructive change** is any DDL that can cause data loss or irreversible
side effects:

- `DROP TABLE` / `DROP COLUMN`
- `ALTER COLUMN … TYPE` that may truncate or coerce data
- Removing a `NOT NULL` constraint, or adding one without a default
- Renaming a column or table
- Any migration that does **not** have a working `down()` method

### Checklist for destructive change PRs

1. **Destructive label** — Tag the PR with `migration:destructive`.
2. **Rollback plan** — The PR description must explain how to revert the
   change (e.g., from a backup, or via a compensating migration).
3. **Backup confirmation** — Confirm a recent backup exists before merging
   (for Supabase: PITR must be enabled; for indexer: snapshot must be
   current).
4. **Two approvals** — At least **two** senior engineers must approve.
5. **Staging trial** — The PR must be deployed to staging and verified for
   ≥ 1 hour before merging to `master` (which triggers production deploy).
6. **Out-of-band window** — Destructive changes should land during a
   pre-announced maintenance window, not during peak traffic.

### Non-destructive (safe) changes

These changes follow the normal PR workflow (one approval, standard CI):

- `CREATE TABLE … IF NOT EXISTS`
- Adding a nullable column
- Creating an index (`CREATE INDEX IF NOT EXISTS CONCURRENTLY` for large tables)
- Adding a comment
- `ALTER TABLE … ADD CONSTRAINT`

---

## 5. Cross-Service Coordination

### Shared tables

The following tables are defined by one service's migration but **written by
another service** at runtime:

| Table                      | Schema defined by | Written by                  |
|----------------------------|-------------------|-----------------------------|
| `push_delivery_failures`   | Oracle migration  | Backend `PushNotificationService` |
| `oracle_jobs`              | Backend migration | *(no active writer)*        |

When modifying these tables, **coordinate with both service teams**. Include
representatives from both teams as reviewers on the PR.

### Cross-service reads

| Table              | Written by | Read by                     | Method                     |
|--------------------|------------|-----------------------------|----------------------------|
| `oracle_jobs`      | *(none)*   | Backend `MonitorService`    | Direct Supabase query      |
| `push_delivery_failures` | Backend | Operators (manual)          | Direct Supabase query      |
| `raffles`, `tickets`, `users`… | Indexer | Backend    | Indexer HTTP API (not DB)  |

---

## 6. Schema Drift Check

Run the drift check to verify that the schema produced by a fresh run of all
committed migrations matches the expected state:

```bash
npm run db:check-drift
```

The check:
1. Spins up a scratch PostgreSQL container (or uses `DATABASE_URL` if set).
2. Applies **all** migrations from backend, indexer, and oracle in the
   correct order.
3. Extracts the resulting schema (tables, columns, types, constraints).
4. Reports any inconsistencies (missing tables, extra columns, type
   mismatches).

For details, see `scripts/check-schema-drift.ts`.

---

## 7. Existing Validation Scripts

| Script                                      | Checks                                        | Run with                            |
|---------------------------------------------|-----------------------------------------------|-------------------------------------|
| `backend/scripts/check-migrations.ts`       | Backend: naming, gaps, duplicates, snake_case; Indexer: rejects round-number placeholder timestamps in new files | `npm run migrations:check` (backend)|
| `indexer/scripts/check-migration-rollback.ts`| Up → down → up cycle on scratch DB           | `npm run migration:rollback-check` (indexer) |
| `oracle/database/migrations/verify-schema.ts`| Table existence in Supabase                  | `npx ts-node` (oracle)             |
| `scripts/check-schema-drift.ts`             | Full-schema drift check against scratch DB    | `npm run db:check-drift` (root)    |

All four checks run in CI on every PR that touches migration files.

---

## 8. Quick Start: Adding a New Table

1. Decide which service **owns** the table (see [schema ownership](README.md)).
2. Create the migration file using the naming convention for that service (§2).
3. If it's an indexer migration, add it to **both** ordered lists in
   `indexer/scripts/check-migration-rollback.ts` and
   `indexer/src/test/integration/helpers/all-migrations.ts`.
4. Run the service's validation: `npm run migrations:check` (backend) or
   `npm run migration:rollback-check` (indexer).
5. Run the full drift check: `npm run db:check-drift -- --update-baseline` (the
   first time, or whenever a schema change is merged).  Subsequent runs
   can use plain `npm run db:check-drift` to verify nothing has drifted.
6. Update `docs/database/README.md` and the per-service schema docs.
7. Open a PR. If the change is destructive, follow §4.
