# Runbook: Oracle Stuck Draw

## Overview
An "Oracle Stuck Draw" occurs when a raffle's draw request has been pending for longer than the expected processing window and the automatic retry machinery has not resolved it. A stuck draw means users are waiting for the raffle result, and the draw time has already passed.

This runbook is linked from the `OracleStuckDrawAboveThreshold` and `OracleStuckDrawMaxAge*` Prometheus alerts.

## Detection

### Prometheus Alerts
| Alert | Severity | Condition | Action |
|-------|----------|-----------|--------|
| `OracleStuckDrawAboveThreshold` | critical | `tikka_oracle_stuck_draws_total > 0` for 2m | Investigate immediately |
| `OracleStuckDrawMaxAgeCritical` | critical | `tikka_oracle_stuck_draw_max_age_seconds > 600` for 1m | Rescue likely required |
| `OracleStuckDrawMaxAgeWarning` | warning | `tikka_oracle_stuck_draw_max_age_seconds > 300` for 2m | Investigate before escalation |

### Dashboard
- Check the **Stuck Draws** panel in the [Oracle Grafana Dashboard](../observability/oracle-dashboard.json).
- Prometheus metrics: `tikka_oracle_stuck_draws_total`, `tikka_oracle_stuck_draw_max_age_seconds`.

### CLI — Rescue Detector
```bash
cd oracle

# List all draw requests with their status classification
npm run oracle:rescue list-stuck
# or
curl http://localhost:3003/rescue/stuck-draws | jq
```

The detector output shows every tracked draw request with:
- **status**: `stuck` | `pending` | `confirmed` | `failed`
- **ageMs**: how long the request has been tracked
- **signals**: why the detector classified it that way (e.g. `contract:DRAWING`, `ledger_lag:150`, `queue_age_exceeded:300000ms`)
- **nextStep**: operator-facing command to execute

Example output:
```json
{
  "entries": [
    {
      "raffleId": 42,
      "requestId": "req_abc123",
      "status": "stuck",
      "ageMs": 300000,
      "signals": ["contract:DRAWING", "ledger_lag:150"],
      "nextStep": "Re-enqueue job: npm run oracle:rescue re-enqueue  ..."
    }
  ],
  "summary": { "stuck": 1, "pending": 0, "confirmed": 0, "failed": 0 }
}
```

### Health Endpoint
```bash
curl http://localhost:3003/health | jq
```
Look for `queueStatus: 'degraded'` or `submitterStatus: 'unhealthy'`.

## Diagnosis

### 1. Read the Detector Signals
The detector's `signals` array tells you why the draw was classified as stuck:
- `contract:DRAWING` — The raffle contract is in DRAWING state but no randomness was submitted.
- `ledger_lag:N` — The Stellar ledger has advanced N ledgers since the request without confirmation (threshold is `LAG_THRESHOLD_LEDGERS`, default 100).
- `queue_age_exceeded:Nms` — The queue job has been in a non-terminal state for more than 5 minutes.
- `has_last_error` — There is a recorded error for this request (check logs).

### 2. Check Queue State
```bash
# List failed jobs
npm run oracle:rescue list-failed

# Get logs for a specific raffle
npm run oracle:rescue logs --raffle <raffleId>
```

### 3. Check Contract State
```bash
# Get contract status via the indexer
curl http://localhost:3002/raffles/<raffleId> | jq '.status'
# A stuck draw will typically have status "DRAWING".
```

### 4. Check Oracle Health
```bash
# Overall health
curl http://localhost:3003/health | jq

# Recent errors in the health metrics
curl http://localhost:3003/health/metrics | jq
```

### 5. Determine the Root Cause

| Signal Pattern | Likely Cause | Resolution |
|----------------|-------------|------------|
| `contract:DRAWING` + `ledger_lag:N` + no errors | VRF proof generation is slow or the submission tx is stuck in the mempool | Wait one more cycle, then re-enqueue |
| `queue_age_exceeded:Nms` + `has_last_error` + `tx_insufficient_fee` | Fee estimate was too low; the transaction could not be submitted | Re-enqueue; if it fails again, force-submit with `--prizeAmount` |
| `queue:failed` + error about RPC timeout | Transient RPC failure | Re-enqueue the job |
| `queue:failed` + error `tx_bad_seq` | Sequence number collision (multi-oracle) | Force-submit with explicit sequence reset |
| No queue job but `contract:DRAWING` + ledger lag | The request was never enqueued or the worker crashed before creating a job | Force-submit |

## When to Re-enqueue vs Force-Submit

### Re-enqueue job
Use when the error is transient and the queue job still exists (state = `failed`):
```bash
npm run oracle:rescue re-enqueue <jobId> \
  --operator <your-name> \
  --reason "Transient RPC error, retrying"
```

### Force-submit
Use when:
- There is no queue job (job was lost)
- Re-enqueue has failed multiple times
- The draw has been stuck for more than 10 minutes and users are waiting
- The contract is in `DRAWING` state but no Bull job exists

```bash
npm run oracle:rescue force-submit <raffleId> <requestId> \
  --operator <your-name> \
  --reason "Urgent manual rescue for stuck draw" \
  [--prizeAmount <amount>]
```

### Force-fail
Use only when the request is malicious or invalid (rare):
```bash
npm run oracle:rescue force-fail <jobId> \
  --operator <your-name> \
  --reason "Requested draw is invalid due to <reason>"
```

## Mitigation

### Step 1 — Confirm the Stuck Draw
```bash
cd oracle
npm run oracle:rescue list-stuck
```

### Step 2 — Attempt Automatic Retry
If a queue job exists and the error looks transient:
```bash
npm run oracle:rescue re-enqueue <jobId> \
  --operator "$(whoami)" \
  --reason "Stuck draw rescue via runbook"
```

### Step 3 — Force Submit if Re-enqueue Fails
```bash
npm run oracle:rescue force-submit <raffleId> <requestId> \
  --operator "$(whoami)" \
  --reason "Stuck draw rescue via runbook"
```

### Step 4 — Verify Resolution
```bash
# Confirm the draw is no longer stuck
npm run oracle:rescue list-stuck

# Check the contract status — should be FINALIZED
curl http://localhost:3002/raffles/<raffleId> | jq '.status'

# Check the alert resolved (wait up to 2m for Prometheus evaluation)
```

## Communication to Affected Users

After resolving a stuck draw, post a message in the project's communication channel (e.g. Discord, Telegram):

> **Raffle #<raffleId> — Draw Delay Resolved**
>
> The draw for raffle #<raffleId> was delayed due to <root cause>.
> The winner has now been selected. We apologise for the inconvenience.
> If you entered this raffle, please check the raffle page for the result.

If the draw could not be resolved immediately and users are waiting, communicate proactively:

> **Raffle #<raffleId> — Draw Delay**
>
> The draw for raffle #<raffleId> is taking longer than expected.
> Our team is investigating and will post an update as soon as the draw is complete.
> Thank you for your patience.

## Verification

1. **Prometheus**: Confirm `tikka_oracle_stuck_draws_total` has returned to 0.
2. **On-Chain**: Check the raffle contract on Stellar Explorer — `receive_randomness` should have been called.
3. **Indexer**: Verify the Indexer has processed the `RAFFLE_FINALIZED` event.
4. **CLI**: Ensure the draw no longer appears in `npm run oracle:rescue list-stuck`.
5. **User-Facing**: Visit the raffle page — the "Draw delayed" banner should be replaced by the winner display.

## Related Resources

- **Rescue CLI code**: [rescue.cli.ts](../../oracle/src/rescue/rescue.cli.ts)
- **Rescue detector logic**: [rescue-detector.service.ts](../../oracle/src/rescue/rescue-detector.service.ts)
- **Stuck draw types**: [stuck-draw.types.ts](../../oracle/src/rescue/stuck-draw.types.ts)
- **Prometheus alert rules**: [alerts.rules.yml](../observability/alerts.rules.yml)
- **On-call troubleshooting**: [ON_CALL_TROUBLESHOOTING.md](../../oracle/ON_CALL_TROUBLESHOOTING.md)
- **Priority queue reference**: [PRIORITY_QUEUE_QUICK_REF.md](../../oracle/PRIORITY_QUEUE_QUICK_REF.md)