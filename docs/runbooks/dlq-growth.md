# Runbook: DLQ Growth

## Overview
The Dead Letter Queue (DLQ) stores events that failed to process after multiple retries. Growth in the DLQ indicates a persistent failure in event ingestion, such as database constraint violations or contract data mismatches.

All failed events are persisted to the `dead_letter_events` table by `DlqService`. The CLI, HTTP API, and metrics all read the same table — there is one source of truth.

## Detection
- **Health Endpoint**: `GET /health` shows a non-zero `dlq_size`.
- **HTTP Status**: `GET /admin/dlq/status` returns `{ depth, lastReplayAt, lastReplayCount }`.
- **Logs**: Look for `DLQ [HANDLER_ERROR]` or `DLQ [DB_TRANSIENT]` in the indexer logs.
- **Metrics**: Monitor `indexer_dlq_depth{contract_address}` and `indexer_dlq_events_total{reason,event_type}` in Grafana.

## Diagnosis
1. **List DLQ Entries**:
   Query the `dead_letter_events` table to see error messages:
   ```sql
   SELECT event_type, reason, error_message, count(*)
   FROM dead_letter_events
   WHERE replayed_at IS NULL
   GROUP BY event_type, reason, error_message
   ORDER BY count DESC;
   ```
2. **Inspect Raw Payload**:
   Check if specific contracts or ledgers are causing failures:
   ```sql
   SELECT id, ledger, event_type, reason, retry_count, error_message
   FROM dead_letter_events
   WHERE replayed_at IS NULL
   ORDER BY ledger ASC
   LIMIT 20;
   ```
3. **Understand Reason Codes**:
   - `HANDLER_ERROR` — retryable; domain handler threw a non-transient error.
   - `DB_TRANSIENT` — retryable; database connection or timeout issue.
   - `PARSE_ERROR` — not retryable; event payload could not be decoded (code fix required).
   - `SCHEMA_UNSUPPORTED` — not retryable; schema version is unsupported by this build.

## Mitigation

### 1. Fix the Underlying Issue
If the error is `duplicate key value violates unique constraint`, investigate whether a chain reorg occurred or if the indexer is processing duplicate events.

For `PARSE_ERROR` or `SCHEMA_UNSUPPORTED`, a code fix or deployment is required before replay will help. Manually set `retryable = false` on those entries to exclude them from replay until the fix is deployed.

### 2. Replay via HTTP API (preferred in Kubernetes)
```bash
# Check DLQ depth
curl http://indexer-service:3000/admin/dlq/status \
  -H "x-api-key: $INTERNAL_API_KEY"

# Replay all eligible entries (retryable=true, replayedAt IS NULL, retryCount < MAX_RETRIES)
curl -X POST http://indexer-service:3000/admin/dlq/replay \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# Replay specific entries by ID
curl -X POST http://indexer-service:3000/admin/dlq/replay \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ids": ["uuid1", "uuid2"]}'
```

See [DLQ_API.md](../../indexer/docs/DLQ_API.md) for full API reference and K8s CronJob example.

### 3. Replay via CLI (requires pod access)
```bash
cd indexer

# Inspect what would be replayed without making changes
npm run dlq:replay -- --dry-run

# Filter by event type and date
npm run dlq:replay -- --dry-run --type TicketPurchased --since 2026-07-01
```

The CLI operates in dry-run mode only — it lists entries but does not execute replay. To trigger actual replay, use the HTTP API or call `DlqService.replayAll()` from within the running application.

### 4. Manual Cleanup
If certain events are permanently unrecoverable:
```sql
-- Mark specific entries as not retryable to exclude from future replays
UPDATE dead_letter_events
SET retryable = false
WHERE event_type = 'RaffleCreated' AND error_message LIKE '%unrecoverable%';

-- Hard-delete entries that should be discarded entirely (irreversible)
DELETE FROM dead_letter_events
WHERE reason = 'PARSE_ERROR' AND created_at < NOW() - INTERVAL '30 days';
```

## Metrics
| Metric | Type | Labels |
|--------|------|--------|
| `indexer_dlq_depth` | Gauge | `contract_address` |
| `indexer_dlq_events_total` | Counter | `reason`, `event_type` |

Both metrics are instrumented in `DlqService.enqueue()` (dispatcher path) and `DlqService.insert()` (direct insert path), and decremented/tracked in `DlqService.replayAll()` after successful replay.

## Verification
1. **Check DLQ Size**: `GET /admin/dlq/status` → `depth` should be 0 or decreasing.
2. **Check Processed Events**: Verify that replayed events appear in `raffle_events` or the relevant table.
3. **Check Metrics**: `indexer_dlq_depth` gauge should drop to 0 per contract after successful replay.

## Package Mapping
- **DLQ Service** (single source of truth): [dlq.service.ts](../../indexer/src/ingestor/dlq.service.ts)
- **HTTP API**: [dlq.controller.ts](../../indexer/src/api/controllers/dlq.controller.ts) — `POST /admin/dlq/replay`, `GET /admin/dlq/status`
- **Replay CLI**: [dlq-replay.command.ts](../../indexer/src/cli/dlq-replay.command.ts)
- **Entity**: [dead-letter-event.entity.ts](../../indexer/src/database/entities/dead-letter-event.entity.ts)
- **API reference**: [DLQ_API.md](../../indexer/docs/DLQ_API.md)
