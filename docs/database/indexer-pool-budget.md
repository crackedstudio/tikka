# Indexer PostgreSQL connection budget

`DB_MAX_POOL` defaults to 5 connections **per PostgreSQL pool in each indexer
pod**. TypeORM creates one primary pool and, when `DATABASE_REPLICA_URL` is
set, one pool for each read replica. Writes use the primary; ordinary reads use
the replicas. Keep this value high enough for ledger catch-up but below the
database's connection budget after accounting for every pod and other clients.

The indexer HPA permits 6 replicas. Its rolling deployment permits one surge
pod, so budget for **7 indexer pods**, not just the base 2. With one read
replica and the default pool size, the indexer can open up to
`7 × (1 primary + 1 replica) × 5 = 70` connections across the two database
servers; without a replica it can open up to `7 × 5 = 35` connections to the
primary. Per-server load matters: a read replica's pool does not consume the
primary server's connection limit.

The backend in this repository talks to Supabase over HTTP and does not create
a direct PostgreSQL pool. Supabase/PostgREST, migrations, administrative tools,
and other clients still consume database connections. Before deploying or
raising `DB_MAX_POOL`, check **each server** separately:

```sql
SHOW max_connections;
SHOW superuser_reserved_connections;
SELECT application_name, count(*)
FROM pg_stat_activity
GROUP BY application_name
ORDER BY count(*) DESC;
```

For each primary or read-replica server, ensure
`7 × DB_MAX_POOL + peak connections from backend/Supabase and other clients
+ reserved headroom < max_connections`. For example, with a 100-connection
primary, 3 reserved slots and a 20-connection reserve for other clients,
the default primary pool budget is `35 + 20 + 3 = 58 < 100`. If other clients
can exceed that reserve, lower the pool size or scale the database before
increasing indexer replicas. This arithmetic is a capacity plan, not evidence
of a live server's configured limit; verify the values above in the target
environment.
