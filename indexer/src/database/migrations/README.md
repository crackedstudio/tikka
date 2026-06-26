# Migration Smoke Test

Run the empty-database migration smoke test locally with:

```bash
npm run test:integration -- migration-smoke.integration.spec.ts
```

The test starts a fresh PostgreSQL Testcontainers instance, runs each migration
inside its own transaction, and verifies key indexes, constraints, and columns
that current entities depend on. When a migration fails, TypeORM reports the
migration class that failed during `runMigrations`.
