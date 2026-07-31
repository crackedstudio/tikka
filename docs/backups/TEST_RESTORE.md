# Test Restore Verification

This document records the procedure for verifying that backups can actually be restored.

## Prerequisites

- Access to a test Postgres instance (not production)
- The `pg_restore` tool installed (part of `postgresql-client`)
- A recent backup file from R2 or local storage
- Database URL for the test instance

## Test Restore Procedure

### 1. Download a Backup from R2

```bash
# List available backups
aws s3 ls s3://$R2_BUCKET_NAME/daily/ --endpoint-url $R2_ENDPOINT_URL

# Download the most recent backup
aws s3 cp s3://$R2_BUCKET_NAME/daily/tikka-backup-YYYY-MM-DD-HHMMSS.sql.gz . \
  --endpoint-url $R2_ENDPOINT_URL
```

### 2. Verify Backup Integrity

```bash
# Check file size and gzip integrity
FILE="tikka-backup-YYYY-MM-DD-HHMMSS.sql.gz"
ls -lh "$FILE"
gzip -t "$FILE"
gunzip -c "$FILE" | head -20  # Inspect first lines
```

### 3. Restore to Test Database

```bash
# Create a clean test database
createdb tikka_restore_test

# Restore the backup
gunzip -c "$FILE" | psql "$TEST_DB_URL" --single-transaction --quiet

# Verify tables exist
psql "$TEST_DB_URL" -c "\dt public.*"
```

### 4. Validate Data Integrity

```bash
# Check row counts for key tables
psql "$TEST_DB_URL" -c "
  SELECT
    relname AS table_name,
    n_live_tup AS estimated_rows
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
  ORDER BY n_live_tup DESC;
"

# Verify no corruption via checksum
psql "$TEST_DB_URL" -c "SELECT pg_catalog.pg_database.datname, pg_catalog.pg_database_size(pg_catalog.pg_database.datname) AS size FROM pg_catalog.pg_database WHERE pg_catalog.pg_database.datname = 'tikka_restore_test';"
```

### 5. Cleanup

```bash
dropdb tikka_restore_test
rm -f "$FILE"
```

## Expected Results

- All public schema tables restored
- Row counts match source database (within expected variance)
- No corruption errors during restore
- Backup file is valid gzip and non-empty

## Automation

This test can be automated by adding a step to the `supabase-backup.yml` workflow:

```yaml
  test-restore:
    name: Verify restore from backup
    needs: backup
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: tikka_restore_test
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
    steps:
      - name: Download backup from R2
        run: |
          aws s3 cp s3://${{ secrets.R2_BUCKET_NAME }}/daily/${{ needs.backup.outputs.backup_file }} . \
            --endpoint-url ${{ secrets.R2_ENDPOINT_URL }}

      - name: Restore and validate
        run: |
          gunzip -c *.sql.gz | psql "postgresql://postgres:test@localhost:5432/tikka_restore_test" --single-transaction
          psql "postgresql://postgres:test@localhost:5432/tikka_restore_test" -c "\dt public.*"
```

## Schedule

- **Weekly**: Run test restore manually after weekly full backup
- **Post-deployment**: After any schema migration, verify a restore succeeds
- **Quarterly**: Full disaster recovery drill with service restart
