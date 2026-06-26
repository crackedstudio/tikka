# Runbook: Oracle Stuck Draw

## Overview
An "Oracle Stuck Draw" occurs when a raffle is ready to be finalized, but the Oracle fails to submit the `receive_randomness` transaction to the contract. This can happen due to RPC failures, insufficient gas/fees, or worker process crashes.

## Detection
- **Alert**: `Oracle job failed after 5 attempts`.
- **CLI**: Check for failed jobs:
  ```bash
  cd oracle
  npm run oracle:rescue list-failed
  ```
- **UI**: Raffle stays in "Processing" or "Ending" state longer than expected.

## Diagnosis
1. **Check Job Status**:
   ```bash
   npm run oracle:rescue list-failed
   ```
2. **Examine Logs**:
   Look for specific error messages (e.g., `tx_insufficient_fee`, `tx_bad_seq`):
   ```bash
   npm run oracle:rescue logs --raffle <raffleId>
   ```
3. **Check RPC Health**:
   ```bash
   curl http://localhost:3003/health/rpc
   ```

## Mitigation
1. **Re-enqueue Job**:
   If the error was transient (e.g., network timeout):
   ```bash
   npm run oracle:rescue re-enqueue <jobId> \
     --operator <your-name> \
     --reason "Transient RPC error, retrying"
   ```
2. **Force Submit (Manual Rescue)**:
   If the job is stuck and re-enqueue doesn't work:
   ```bash
   npm run oracle:rescue force-submit <raffleId> <requestId> \
     --operator <your-name> \
     --reason "Urgent manual rescue for stuck draw"
   ```
3. **Check Balance**:
   Ensure the Oracle's source account has enough XLM for transaction fees.

## Verification
1. **On-Chain**:
   Check the raffle contract on Stellar Explorer to ensure `receive_randomness` was successfully called.
2. **Indexer**:
   Verify the Indexer has processed the `RAFFLE_FINALIZED` event.
3. **CLI**:
   Ensure the job is no longer in the failed list.

## Package Mapping
- **Rescue CLI**: [rescue.cli.ts](../../oracle/src/rescue/rescue.cli.ts)
- **Troubleshooting**: [ON_CALL_TROUBLESHOOTING.md](../../oracle/ON_CALL_TROUBLESHOOTING.md)
- **Priority Queue**: [PRIORITY_QUEUE_QUICK_REF.md](../../oracle/PRIORITY_QUEUE_QUICK_REF.md)
