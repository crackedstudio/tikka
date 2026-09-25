# Indexer hot-path index audit

> Issue: [#1122](https://github.com/crackedstudio/tikka/issues/1122) · Package: `indexer/`

This document records the static query audit of the indexer PostgreSQL schema, the indexes added in migration `1770000000000-AuditHotPathIndexes`, and how to verify each hot path with `EXPLAIN ANALYZE`.

Related: [benchmarking-plan.md](./benchmarking-plan.md) (§1.4 Database SLOs).

---

## 1. How top queries were captured

| Source | Location | What it surfaces |
|--------|----------|------------------|
| TypeORM slow query logger | `indexer/src/database/typeorm-query.logger.ts` | Queries slower than `SLOW_QUERY_THRESHOLD_MS` (default 200 ms) |
| Prometheus counter | `tikka_db_slow_query_total` | Hashed SQL templates for slow queries |
| Static code review | API controllers, processors, ingestor, archive job | WHERE / ORDER BY / JOIN columns that must use indexes |

### Optional: `pg_stat_statements` (staging / production)

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

SELECT
  calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  left(query, 120) AS query
FROM pg_stat_statements
WHERE query ILIKE '%FROM%users%'
   OR query ILIKE '%FROM%tickets%'
   OR query ILIKE '%FROM%raffles%'
   OR query ILIKE '%FROM%raffle_events%'
ORDER BY total_exec_time DESC
LIMIT 25;
```

Reset between deploys with `SELECT pg_stat_statements_reset();` when measuring before/after.

---

## 2. Hot query inventory

| Path | SQL shape | Expected plan after migration |
|------|-----------|-------------------------------|
| `GET /leaderboard?by=wins` | `ORDER BY total_raffles_won DESC, address` | Index Scan on `IDX_USERS_TOTAL_RAFFLES_WON_ADDRESS` |
| `GET /leaderboard?by=volume` | `ORDER BY CAST(total_prize_xlm AS NUMERIC) DESC` | Index Scan on `IDX_USERS_TOTAL_PRIZE_XLM_NUMERIC_ADDRESS` |
| `GET /leaderboard?by=tickets` | `ORDER BY total_tickets_bought DESC` | Index Scan on `IDX_USERS_TOTAL_TICKETS_BOUGHT_ADDRESS` |
| `GET /raffles?status=` | `WHERE status = ? ORDER BY created_at DESC` | Index Scan on `idx_raffles_status_created_at` |
| `GET /raffles/:id` | `WHERE id = ?` | Index Scan / PK |
| Events by raffle | `WHERE raffle_id = ?` | Index Scan on `idx_raffle_events_raffle_id` |
| User history / first-entry | `WHERE owner = ? AND raffle_id = ?` | Index Scan on `idx_tickets_owner_raffle_id` |
| Reorg rollback | `WHERE ledger >= ?` (events) | Index Scan on `idx_raffle_events_ledger` |
| Reorg rollback | `WHERE purchased_at_ledger >= ?` | Index Scan on `idx_tickets_purchased_at_ledger` |
| Reorg rollback | `WHERE created_ledger >= ?` | Index Scan on `idx_raffles_created_ledger` |
| Archive job | `WHERE indexed_at < ? ORDER BY indexed_at, id` | Index Scan on `idx_raffle_events_indexed_at_id` |
| DLQ replay | filter by `replayed_at` + `ledger` | Index Scan on `idx_dle_replay_eligible` / `idx_dle_ledger` |

---

## 3. Critical finding: orphaned leaderboard migration

`indexer/src/1711620000000-OptimizeLeaderboard.ts` defined the three leaderboard indexes but lived **outside** `indexer/src/database/migrations/`. With `migrationsRun: true` and data-source loading only `database/migrations/*`, those indexes never applied.

**Resolution:** the same DDL (with `IF NOT EXISTS`) is now in `AuditHotPathIndexes1770000000000`. The orphan file is a documented no-op.

---

## 4. Indexes added (`1770000000000-AuditHotPathIndexes`)

| Index | Table | Columns |
|-------|-------|---------|
| `IDX_USERS_TOTAL_RAFFLES_WON_ADDRESS` | `users` | `(total_raffles_won DESC, address ASC)` |
| `IDX_USERS_TOTAL_PRIZE_XLM_NUMERIC_ADDRESS` | `users` | `((CAST(total_prize_xlm AS NUMERIC)) DESC, address ASC)` |
| `IDX_USERS_TOTAL_TICKETS_BOUGHT_ADDRESS` | `users` | `(total_tickets_bought DESC, address ASC)` |
| `idx_tickets_owner_raffle_id` | `tickets` | `(owner, raffle_id)` |
| `idx_tickets_purchased_at_ledger` | `tickets` | `(purchased_at_ledger)` |
| `idx_raffles_status_created_at` | `raffles` | `(status, created_at DESC)` |
| `idx_raffles_created_ledger` | `raffles` | `(created_ledger)` |
| `idx_raffles_winner_not_null` | `raffles` | `(winner) WHERE winner IS NOT NULL` |
| `idx_raffle_events_ledger` | `raffle_events` | `(ledger)` |
| `idx_raffle_events_indexed_at_id` | `raffle_events` | `(indexed_at, id)` |
| `idx_dle_ledger` | `dead_letter_events` | `(ledger)` |
| `idx_dle_replay_eligible` | `dead_letter_events` | `(replayed_at, ledger)` |

Entity `@Index` decorators were updated to match (expression index on `total_prize_xlm` remains migration-only).

### Intentionally not added

- Extra `event_type` / `contract_address` indexes (already covered by `1750000000000`).
- Blind `idx_raffles_asset` without traffic evidence.
- Dropping single-column `status` / `created_at` indexes in the same PR (revisit after EXPLAIN confirms the composite is preferred).

---

## 5. Verification procedure (`EXPLAIN ANALYZE`)

Run against a staging DB after the migration:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM users
ORDER BY total_raffles_won DESC, address ASC
LIMIT 50;

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM users
ORDER BY CAST(total_prize_xlm AS NUMERIC) DESC, address ASC
LIMIT 50;

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM raffles
WHERE status = 'open'
ORDER BY created_at DESC
LIMIT 20;

EXPLAIN (ANALYZE, BUFFERS)
SELECT 1 FROM tickets
WHERE owner = 'GEXAMPLE…' AND raffle_id = 1 AND purchase_tx_hash <> 'x'
LIMIT 1;

EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*) FROM raffle_events WHERE ledger >= 1000000;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM raffle_events
WHERE indexed_at < NOW() - INTERVAL '30 days'
ORDER BY indexed_at ASC, id ASC
LIMIT 500;
```

**Acceptance:** each plan should show `Index Scan` or `Index Only Scan` on the indexes listed in §2 (not `Seq Scan` on the full table for selective predicates).

---

## 6. Residual risks

| Risk | Notes |
|------|-------|
| Full 6-key leaderboard cascade | Primary-sort indexes cover the dominant `ORDER BY`; tie-break columns may still sort in memory for small page sizes. |
| Asset-filtered raffle list | Add `idx_raffles_asset` only if slow-query logs show volume. |
| `webhook_deliveries` | PK-only today; audit again when delivery history queries ship. |
| Ticket `ON CONFLICT` shape | Processor conflict target vs unique constraint on `purchase_tx_hash` alone is a separate correctness review. |
