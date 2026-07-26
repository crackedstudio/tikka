# Database Migrations

This directory contains raw SQL migrations for the Oracle service.

## Execution Requirements

Migrations are designed to be **idempotent**, meaning they can be run multiple times safely without causing errors or duplicating data structures. They contain `IF NOT EXISTS` clauses for tables and indexes.

### Local Development (Supabase)
If you are using the local Supabase CLI, you can apply migrations by placing them in the Supabase migrations directory or running them directly:

```bash
supabase db execute -f database/migrations/008_vrf_audit_log.sql
```

Alternatively, you can apply them using `psql`:

```bash
psql -h localhost -p 5432 -U postgres -d postgres -f database/migrations/008_vrf_audit_log.sql
```

### Staging and Production
For staging and production environments, migrations should be applied using your CI/CD pipeline or directly against the managed database using `psql`:

```bash
psql $DATABASE_URL -f database/migrations/008_vrf_audit_log.sql
```

**Note:** Ensure migrations are applied in numerical order (e.g., `008_` before `009_`).

## Schema Verification

To ensure that the required tables have been successfully created, run the schema verification script:

```bash
cd ../../
npx ts-node database/migrations/verify-schema.ts
```

This script will attempt to query the `vrf_audit_log` table (and any other critical tables). If the table is missing, the script will exit with an error code, which can be caught in CI/CD pipelines to block deployments.
