# Runbook: DLQ Growth

## Overview
The Dead Letter Queue (DLQ) stores events that failed to process after multiple retries. Growth in the DLQ indicates a persistent failure in event ingestion, such as database constraint violations or contract data mismatches.

## Detection
- **Health Endpoint**: `GET /health` shows a non-zero `dlq_size`.
- **Logs**: Look for `DLQ: stored failed event` in the indexer logs.
- **Metrics**: Monitor `indexer_dlq_size` in Grafana.

## Diagnosis
1. **List DLQ Entries**:
   Query the `dead_letter_events` table to see error messages:
   ```sql
   SELECT event_type, error_message, count(*) 
   FROM dead_letter_events 
   GROUP BY event_type, error_message;
   ```
2. **Inspect Raw Payload**:
   Check if specific contracts or ledgers are causing failures:
   ```sql
   SELECT raw_payload 
   FROM dead_letter_events 
   WHERE event_type = 'TICKET_PURCHASED' 
   LIMIT 5;
   ```

## Mitigation
1. **Fix Underlying Issue**:
   If the error is `duplicate key value violates unique constraint`, investigate if a reorg occurred or if the indexer is processing duplicate events.
2. **Replay DLQ**:
   Once the root cause is fixed, replay the failed events. Note that the CLI `dlq:replay` only lists entries; actual replay is handled by the indexer's background retry job or can be triggered via `DlqService.replayAll()` in the code.
   ```bash
   cd indexer
   # List DLQ entries (dry-run)
   npm run dlq:replay -- --dry-run
   ```
3. **Manual Cleanup**:
   If certain events are unrecoverable and should be ignored:
   ```sql
   DELETE FROM dead_letter_events WHERE error_message LIKE '%unrecoverable error%';
   ```

## Verification
1. **Check DLQ Size**:
   Verify `dlq_size` is 0 via `GET /health`.
2. **Check Processed Events**:
   Verify that the replayed events now appear in `raffle_events`.

## Package Mapping
- **DLQ Service**: [dlq.service.ts](../../indexer/src/ingestor/dlq.service.ts)
- **Replay CLI**: [dlq-replay.command.ts](../../indexer/src/cli/dlq-replay.command.ts)
- **Entity**: [dead-letter-event.entity.ts](../../indexer/src/database/entities/dead-letter-event.entity.ts)
