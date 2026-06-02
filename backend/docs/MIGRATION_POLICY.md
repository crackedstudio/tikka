# Database Migration Naming & Sequencing Policy

## Overview

This document establishes the naming convention and sequencing requirements for database migrations to prevent ordering errors and deployment failures.

## Naming Convention

### Format
```
NNN_descriptive_name.sql
```

Where:
- **NNN** = Three-digit sequence number (001, 002, ..., 999)
- **Descriptive name** = snake_case, 2-4 words describing the migration's purpose

### Examples
✅ GOOD
- `001_raffle_metadata.sql`
- `002_notifications.sql`
- `010_soft_delete_raffle_metadata.sql`
- `011_webhooks.sql`

❌ BAD
- `8_siws_nonces.sql` (not zero-padded)
- `08_siws_nonces.sql` (wrong padding)
- `008_webhooks.sql` & `008_siws_nonces.sql` (duplicate sequence)
- `migration_webhooks.sql` (no sequence number)

## Sequencing Rules

### 1. Sequential Numbering (No Gaps, No Duplicates)
- Migrations **must** be numbered sequentially from 001 onwards
- Gaps are not allowed (001, 002, 003... never 001, 002, 004)
- Duplicate sequence numbers are **critical errors** and block deployments
- Each new migration increments by exactly 1

### 2. Creation Order = Execution Order
- Migrations are executed in **sequence number order** during deployment
- The file system's alphabetical sort must match the intended execution order
- Migrations with three-digit zero-padded numbers sort correctly alphabetically

### 3. Dependency Declarations
When a migration depends on a previous one, include a comment at the top:

```sql
-- Migration 010: Webhooks table
-- Depends on: 006_refresh_tokens.sql (user_address column pattern)

CREATE TABLE IF NOT EXISTS webhooks (
  ...
);
```

### 4. Idempotency
All migrations **must** be idempotent (safe to run multiple times):
- Use `CREATE TABLE IF NOT EXISTS`
- Use `CREATE INDEX IF NOT EXISTS`
- Use `DROP ... IF EXISTS` before re-creating
- Never assume a previous state

## Current Migration Sequence

| Seq  | File | Purpose |
|------|------|---------|
| 001  | raffle_metadata | Core raffle metadata table |
| 002  | notifications | User notification subscriptions |
| 003  | oracle_jobs | Oracle job lifecycle tracking |
| 004  | multi_image_support | Add image array support |
| 005  | push_tokens | FCM/push device tokens |
| 006  | refresh_tokens | Persistent refresh token storage |
| 007  | search_optimization | Full-text search vector column + GIN index |
| 008  | fulltext_search_ranked | Search RPC with ts_rank ordering |
| 009  | siws_nonces | SIWS nonce storage for replay protection |
| 010  | soft_delete_raffle_metadata | Soft-delete support for raffles |
| 011  | webhooks | Webhook subscriptions & delivery logs |
| 012  | notification_subscriptions | Normalized notification subscriptions |
| 013  | refresh_token_families | Token family grouping for reuse detection |

## Validation & CI Checks

### Pre-Deployment Validation
All migrations are validated before deployment by the CI check script (`scripts/check-migrations.ts`):

1. ✅ No duplicate sequence numbers
2. ✅ Sequence numbers are zero-padded to 3 digits
3. ✅ No gaps in the sequence (001, 002, 003... never 001, 002, 004)
4. ✅ Filenames follow snake_case convention
5. ✅ All files have `.sql` extension

### Running the Check Locally
```bash
npm run migrations:check
```

The CI pipeline automatically runs this check on all PRs and deployments. PRs with migration issues will fail the `backend` workflow.

## Adding a New Migration

### Steps
1. **Determine the next sequence number:**
   - Run `npm run migrations:check` to see the current highest number
   - Add 1 to get the next number

2. **Create the file:**
   ```
   NNN_description.sql
   ```

3. **Include a header comment:**
   ```sql
   -- Migration NNN: Brief description
   -- Depends on: NNN_previous_migration.sql (if applicable)
   
   -- Your SQL here
   ```

4. **Test locally:**
   ```bash
   # Connect to your local Supabase instance and run the SQL
   ```

5. **Commit with descriptive message:**
   ```
   git commit -m "db: add migration NNN for [feature]"
   ```

## Troubleshooting

### "Duplicate migration number 008"
Check the migrations directory for multiple files starting with the same 3-digit prefix:
```bash
ls -1 backend/database/migrations/*.sql | cut -d_ -f1 | sort | uniq -d
```
Rename duplicates using the next available sequence numbers.

### "Gap detected: 001, 002, 004 (missing 003)"
A migration was likely renamed or deleted. Either:
- Create the missing 003, or
- Renumber subsequent migrations to remove the gap

### Migration fails: "table already exists"
Ensure the migration uses idempotent SQL:
```sql
-- ✅ GOOD
CREATE TABLE IF NOT EXISTS my_table (...)

-- ❌ BAD
CREATE TABLE my_table (...)
```

## References
- Supabase Migrations: https://supabase.com/docs/guides/migrations/overview
- PostgreSQL idempotency best practices
- Related issue: [Migration ordering risk - #ISSUE_NUMBER]
