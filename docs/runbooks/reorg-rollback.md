# Runbook: Reorg Rollback

## Overview
A blockchain reorganization (reorg) occurs when the Stellar network switches to a different fork. The Indexer must detect this and roll back its state to the last common ledger to maintain data integrity.

## Detection
- **Logs**: `Reorg detected at ledger <L> — rolling back`.
- **Metrics**: `indexer_reorg_detected` counter increments.
- **Data Inconsistency**: Users report "missing" or "duplicate" transactions that were previously visible.

## Diagnosis
1. **Identify Fork Point**:
   Check logs for the ledger number where the reorg was detected.
2. **Verify Network State**:
   Compare the Indexer's `last_ledger` and `ledger_hashes` with a trusted Horizon node or Stellar Explorer.
3. **Check Service Status**:
   Ensure the Indexer resumed ingestion after the automatic rollback.

## Mitigation
### Automatic Rollback
The `LedgerPollerService` automatically triggers `ReorgRollbackService` when a hash mismatch is detected.

### Manual Rollback (Emergency)
If the automatic rollback fails or is incomplete:
1. **Stop the Indexer**:
   ```bash
   kubectl scale deployment tikka-indexer --replicas=0
   ```
2. **Execute SQL Rollback**:
   Connect to the Indexer database and run:
   ```sql
   -- Set the ledger to roll back FROM (inclusive)
   \set rollback_ledger 1234567

   BEGIN;
   DELETE FROM raffle_events WHERE ledger >= :rollback_ledger;
   DELETE FROM tickets WHERE purchased_at_ledger >= :rollback_ledger;
   DELETE FROM raffles WHERE created_ledger >= :rollback_ledger;
   
   UPDATE indexer_cursor
   SET ledger_hashes = (
     SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
     FROM jsonb_array_elements(ledger_hashes) AS elem
     WHERE (elem->>'ledger')::int < :rollback_ledger
   ),
   last_ledger = GREATEST(0, :rollback_ledger - 1)
   WHERE id = 1;
   COMMIT;
   ```
3. **Restart the Indexer**:
   ```bash
   kubectl scale deployment tikka-indexer --replicas=1
   ```

## Verification
1. **Check Status**:
   ```bash
   cd indexer
   npm run status
   ```
   Ensure `current_ledger` is moving forward and `lag_ledgers` is decreasing.
2. **Verify Data**:
   Check a few transactions from the rollback period to ensure they are re-indexed correctly.

## Package Mapping
- **Rollback Service**: [reorg-rollback.service.ts](../../indexer/src/ingestor/reorg-rollback.service.ts)
- **Detection Logic**: [ledger-poller.service.ts](../../indexer/src/ingestor/ledger-poller.service.ts)
- **Cursor Management**: [cursor-manager.service.ts](../../indexer/src/ingestor/cursor-manager.service.ts)
