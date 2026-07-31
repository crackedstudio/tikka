# Migration Smoke Test

Run the empty-database migration smoke test locally with:

```bash
npm run test:integration -- migration-smoke.integration.spec.ts
```

The test starts a fresh PostgreSQL Testcontainers instance, runs each migration
inside its own transaction, and verifies key indexes, constraints, and columns
that current entities depend on. When a migration fails, TypeORM reports the
migration class that failed during `runMigrations`.

# Migration Rollback Check

Verify that the latest migrations can be reverted and re-applied cleanly:

```bash
# Integration test (Testcontainers)
npm run test:integration -- migration-rollback.integration.spec.ts

# CI-runnable script (Testcontainers, or DATABASE_URL scratch DB)
npm run migration:rollback-check

# Against an existing scratch database
DATABASE_URL=postgres://user:pass@localhost:5432/tikka_scratch \
  ROLLBACK_COUNT=5 npm run migration:rollback-check
```

The check runs **all** migrations up, reverts the last `ROLLBACK_COUNT` (default 5),
then re-applies them. Fix any `down()` that fails or drops data it should preserve.
