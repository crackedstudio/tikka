# Indexer DLQ Triage Runbook

Use this runbook for `IndexerDlqDepthHigh`, `IndexerDlqGrowthRateHigh`, or `IndexerDlqOldestEventStale`. The DLQ is stored in `dead_letter_events`; do not delete entries to silence an alert.

## 1. Inspect

Check the current depth and latest replay metadata:

```bash
curl "$INDEXER_URL/admin/dlq/status" \
  -H "x-api-key: $INTERNAL_API_KEY"
```

Review active entries by reason, type, and age:

```sql
SELECT reason, event_type, retryable, COUNT(*) AS entries,
       MIN(created_at) AS oldest_created_at
FROM dead_letter_events
WHERE replayed_at IS NULL
GROUP BY reason, event_type, retryable
ORDER BY oldest_created_at ASC;
```

Inspect individual failures and payload context:

```sql
SELECT id, ledger, contract_id, event_type, reason, retryable,
       retry_count, attempt_count, error_message, created_at, last_attempt_at
FROM dead_letter_events
WHERE replayed_at IS NULL
ORDER BY created_at ASC
LIMIT 50;
```

Compare the three DLQ metrics in Prometheus:

- `indexer_dlq_unreplayed_events` is the current total depth.
- `deriv(indexer_dlq_unreplayed_events[15m])` is the net depth growth rate.
- `time() - indexer_dlq_oldest_unreplayed_event_timestamp_seconds` is the age of the oldest active entry in seconds.

## 2. Classify

| Reason               | Meaning                                       | Triage                                                                                                                         |
| -------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `DB_TRANSIENT`       | A database connection or timeout failure.     | Check database health, connection saturation, and recent database errors. Replay after database health is restored.            |
| `HANDLER_ERROR`      | Event processing raised an error.             | Check the stack/error message and handler logs; establish whether the cause was transient or a code/data defect before replay. |
| `PARSE_ERROR`        | The event payload could not be decoded.       | Treat as non-retryable until parser/schema support is fixed and deployed. Escalate to the indexer owner.                       |
| `SCHEMA_UNSUPPORTED` | The event uses an unsupported schema version. | Confirm the required schema and deployment version; do not replay until compatible code is deployed.                           |

Also check whether failures cluster on one event type, contract, or ledger range. A rising retry count without successful replay usually indicates the underlying issue is unresolved.

## 3. Decide Whether to Replay

Replay only after the underlying cause is understood and corrected, and the handler is safe to run again. `DlqService` excludes non-retryable reasons and entries that have exhausted `MAX_RETRIES` (currently 5) from normal replay.

Use the CLI to inspect the candidate set without changing rows:

```bash
pnpm --filter tikka-indexer dlq:replay -- --dry-run
pnpm --filter tikka-indexer dlq:replay -- --dry-run --type TicketPurchased --since 2026-09-01
```

The CLI is inspection-only; it does not execute replay. For a deliberate replay, use the authenticated admin API. Replay all eligible entries:

```bash
curl -X POST "$INDEXER_URL/admin/dlq/replay" \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Or request specific entry IDs:

```bash
curl -X POST "$INDEXER_URL/admin/dlq/replay" \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ids":["<entry-id>"]}'
```

The API returns a job ID and runs asynchronously. The current status endpoint reports the last completed replay, not live per-job progress. Note that ID-based replay is implemented through the selected entry's ledger range and may include adjacent entries from that ledger; review the API behavior before using it for targeted remediation.

## 4. Verify and Escalate

After replay, verify that depth is falling, the oldest-entry age resets or clears, and the corresponding records have `replayed_at` set. Confirm the replayed events appear in their expected domain tables and check indexer error logs for recurrence.

Escalate to the indexer on-call/owner when the DLQ continues growing after a replay, a non-retryable parse/schema issue needs a code change, the oldest entry remains beyond one hour, or replay risks duplicate or inconsistent domain state. Include the alert name, affected event types/contracts/ledgers, representative IDs and error messages, recent deployments, and actions already taken.

Do not hard-delete DLQ rows or change `retryable` directly in production without incident-owner approval and a documented recovery decision.

## Alert Thresholds

| Alert                        | Trigger                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `IndexerDlqDepthHigh`        | At least 10 unreplayed entries for 5 minutes.                                |
| `IndexerDlqGrowthRateHigh`   | Net depth growth above approximately 3 entries per 15 minutes for 5 minutes. |
| `IndexerDlqOldestEventStale` | The oldest unreplayed entry is over 1 hour old for 5 minutes.                |

For the API contract and replay eligibility rules, see [DLQ_API.md](../../indexer/docs/DLQ_API.md).
