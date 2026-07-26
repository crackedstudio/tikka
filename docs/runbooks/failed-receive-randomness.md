# Runbook: Failed receive_randomness Submission

## Overview
This runbook specifically addresses failures when the Oracle attempts to submit the `receive_randomness` transaction to a Tikka contract. This is the final step in concluding a raffle.

## Detection
- **Logs**: `Failed to submit receive_randomness for raffle <ID>: <Error>`.
- **Metrics**: `oracle_submission_failures` counter.
- **Queue**: Job moves to the "failed" set in BullMQ.

## Diagnosis
1. **Fetch Error Code**:
   Identify the Stellar transaction error code (e.g., `op_underfunded`, `tx_too_late`):
   ```bash
   cd oracle
   npm run oracle:rescue logs --raffle <raffleId> --limit 1
   ```
2. **Check Contract State**:
   Verify if the contract is still expecting randomness:
   ```bash
   # Use Stellar CLI or Explorer to query contract data
   stellar contract read --id <CONTRACT_ID> -- ...
   ```
3. **Check Fee Estimation**:
   If `tx_insufficient_fee` occurs, check if the network fees have spiked:
   ```bash
   curl https://horizon.stellar.org/fee_stats
   ```

## Mitigation
1. **Bump Fees and Retry**:
   If the failure was due to low fees, the Oracle should automatically retry with a bump, but manual re-enqueue can be done:
   ```bash
   npm run oracle:rescue re-enqueue <jobId> --reason "Fee spike, retrying"
   ```
2. **Manual Transaction Submission**:
   If the Oracle service is completely down, a developer can submit the transaction manually using a script or the Stellar CLI, though `force-submit` is preferred.
   ```bash
   npm run oracle:rescue force-submit <raffleId> <requestId> --operator <your-name>
   ```
3. **Address Sequence Mismatches**:
   If `tx_bad_seq` occurs, the Oracle's sequence number is out of sync. Restart the Oracle service to refresh the sequence number from Horizon.

## Verification
1. **Transaction Success**:
   Confirm the transaction hash in the logs and verify it on [Stellar Expert](https://stellar.expert).
2. **Raffle Status**:
   Ensure the raffle state in the Tikka UI/API has moved from "Finalizing" to "Ended".

## Package Mapping
- **Submission Logic**: [tx-submitter.service.ts](../../oracle/src/submitter/tx-submitter.service.ts)
- **Queue Worker**: [randomness.worker.ts](../../oracle/src/queue/randomness.worker.ts)
- **Rescue CLI**: [rescue.cli.ts](../../oracle/src/rescue/rescue.cli.ts)
