# Runbook: Indexer Lag

## Overview

Indexer lag occurs when the Tikka Indexer's `last_ledger` falls significantly behind the Stellar network's latest closed ledger. This can be caused by network congestion, database performance issues, or service interruptions.

## Dashboard (issue #211)

Design reference for an indexer lag dashboard:

- Figma: https://www.figma.com/design/Yja14jB0ZqnCj09eG64A8E/Untitled?node-id=14-187&t=SgAZJM3WZOL62AAP-1
- Related issue: Implement dashboard for indexer lag (#211)

Existing Grafana panels already chart `tikka_indexer_lag_ledgers` (see `indexer/grafana/indexer-dashboard.json` and `docs/observability/GRAFANA.md`).

## Detection

- **Alert**: `indexer_lag_alert` triggers when lag exceeds the threshold (default: 50 ledgers).
- **Health Endpoint**: `GET /health` returns `lagStatus: 'critical'` or `degraded`.
- **Dashboard**: Check the "Indexer Lag" panel in the [Indexer Grafana Dashboard](../../indexer/grafana/indexer-dashboard.json).
- **CLI**: Run the status command from `indexer/`. A one-shot check prints a
  status report and exits non-zero when a dependency is down or another
  actionable warning is present:
  ```bash
  cd indexer
  pnpm run status
  pnpm run status -- --json
  ```

## Diagnosis

1. **Check Lag Size**:
   Identify the number of ledgers behind:
   ```bash
   pnpm run status -- --json | jq '.indexer.lag_ledgers'
   ```
2. **Check DB Performance**:
   Look for high `waiting` counts in the DB pool:
   ```bash
   pnpm run status -- --json | jq '.db.pool'
   ```
3. **Check Logs**:
   Look for ingestion errors or connection timeouts:
   ```bash
   # In production k8s
   kubectl logs -l app=tikka-indexer -f
   ```
4. **Check Horizon Connection**:
   Verify the Indexer can reach Horizon:
   ```bash
   curl -I $(grep HORIZON_URL .env | cut -d= -f2)
   ```

## Mitigation

1. **Restart Service**:
   Often, a simple restart can resolve transient SSE connection issues.
   ```bash
   kubectl rollout restart deployment tikka-indexer
   ```
2. **Increase DB Pool Size**:
   If the DB pool is saturated, increase `DB_MAX_POOL` in the environment variables.
3. **Check for Reorgs**:
   If the log shows repeated rollbacks, the network might be unstable.
4. **Manual Backfill**:
   If a large gap exists, use the backfill script:
   ```bash
   cd backend
   npm run scripts/backfill.ts -- --from <start_ledger> --to <end_ledger>
   ```

## Verification

1. **Monitor Lag**:
   Run `pnpm run status -- --json` every minute and ensure
   `.indexer.lag_ledgers` is decreasing. Keep `pipefail` enabled when piping
   through `jq` so monitoring preserves the CLI's non-zero unhealthy exit code.
2. **Check Health**:
   Verify `GET /health` returns `status: "ok"`.

## Package Mapping

- **Metrics/Detection**: [health.service.ts](../../indexer/src/health/health.service.ts)
- **Ingestion Logic**: [ledger-poller.service.ts](../../indexer/src/ingestor/ledger-poller.service.ts)
- **Status CLI**: [status.command.ts](../../indexer/src/cli/status.command.ts)
