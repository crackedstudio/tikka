# DB OPERATIONAL stub

Owner: @db-team

Required links:
- Dashboards:
  - Replication lag: <link>
  - Disk usage & slow queries: <link>

Alerts:
- Backup failures (Pager: @db-team)
- Replication lag above threshold

Runbook:
- Restore from backup, point-in-time restore instructions.

Rollback instructions:
- How to revert problematic migrations and validate data integrity.

Verification:
- Test restore cadence and sanity checks.

Current gaps:
- Monthly test restores not automated

---

## Schema Drift Check

`db/baseline-schema.sql` is the machine-generated reference schema. It must be
regenerated every time a schema-changing migration is merged.

### Refreshing the baseline (required after every schema migration)

```bash
# Ensure Docker is running, then:
pnpm db:check-drift -- --update-baseline
git add db/baseline-schema.sql
git commit -m "chore(db): refresh baseline schema"
```

CI will fail on any PR that touches a migration path without an up-to-date baseline.

### Migration directories

| Package  | Path                                | Runner           |
|----------|-------------------------------------|------------------|
| backend  | `backend/database/migrations/`      | plain psql (SQL) |
| oracle   | `oracle/database/migrations/`       | plain psql (SQL) |
| indexer  | `indexer/src/database/migrations/`  | TypeORM          |
| shared   | `db/migrations/`                    | plain psql (SQL) |

### Notes

- `db/migrations/0000_backend_reader_role.sql` must be applied AFTER the indexer
  TypeORM migrations that create the `raffle` and `participant` tables.
- The baseline is generated with `pg_dump` from PostgreSQL 16. If the major
  PostgreSQL version changes, regenerate the baseline with `--update-baseline`.
