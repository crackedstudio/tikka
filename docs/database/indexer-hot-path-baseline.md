# Indexer hot-path baseline and coverage audit

Issue: [#1603](https://github.com/crackedstudio/tikka/issues/1603)

This baseline captures the indexer query hot paths that were reviewed for `users`, `tickets`, `raffles`, `raffle_events`, and `dead_letter_events`, along with the index each query relies on. The intent is to keep the ingestion path fast while preserving materialized query coverage for the backend.

## Hot-path queries and supporting index

| Query path                  | Representative SQL                                                                             | Supporting index                            |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Leaderboard by wins         | `SELECT * FROM users ORDER BY total_raffles_won DESC, address ASC LIMIT 50;`                   | `IDX_USERS_TOTAL_RAFFLES_WON_ADDRESS`       |
| Leaderboard by prize volume | `SELECT * FROM users ORDER BY CAST(total_prize_xlm AS NUMERIC) DESC, address ASC LIMIT 50;`    | `IDX_USERS_TOTAL_PRIZE_XLM_NUMERIC_ADDRESS` |
| Leaderboard by tickets      | `SELECT * FROM users ORDER BY total_tickets_bought DESC, address ASC LIMIT 50;`                | `IDX_USERS_TOTAL_TICKETS_BOUGHT_ADDRESS`    |
| User ticket history         | `SELECT 1 FROM tickets WHERE owner = ? AND raffle_id = ? LIMIT 1;`                             | `idx_tickets_owner_raffle_id`               |
| Reorg / ledger range        | `SELECT COUNT(*) FROM raffle_events WHERE ledger >= ?;`                                        | `idx_raffle_events_ledger`                  |
| Archive cursor              | `SELECT id FROM raffle_events WHERE indexed_at < ? ORDER BY indexed_at ASC, id ASC LIMIT 500;` | `idx_raffle_events_indexed_at_id`           |
| Raffle feed                 | `SELECT * FROM raffles WHERE status = ? ORDER BY created_at DESC LIMIT 20;`                    | `idx_raffles_status_created_at`             |
| Replay/ledger recovery      | `SELECT ... FROM dead_letter_events WHERE replayed_at IS NOT NULL AND ledger >= ?;`            | `idx_dle_replay_eligible`, `idx_dle_ledger` |

## EXPLAIN verification pattern

Run each query with `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` against a staging or local dataset that approximates production volume, then confirm the plan shows `Index Scan` or `Index Only Scan` rather than `Seq Scan` on the hot tables.

For example:

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM users
ORDER BY total_raffles_won DESC, address ASC
LIMIT 50;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM raffles
WHERE status = 'open'
ORDER BY created_at DESC
LIMIT 20;
```

## Operational guardrail

The compose stack enables `pg_stat_statements`, and the CI guard `pnpm --dir indexer run check:hotpath-seqscan` fails when the representative hot-path plans regress to sequential scans.

This baseline is intentionally conservative: the goal is to prove each hot path is covered by an index before it ships, and to remove unused indexes when new patterns emerge so ingestion throughput stays stable.
