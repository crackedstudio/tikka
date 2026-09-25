# Ingestion Lag Runbook (issue #1110)

The indexer's single most important health signal is **how far behind the
Stellar network tip it has fallen**. This runbook documents the canonical
lag metrics, the alert thresholds operators should care about, and the
playbook when those alerts fire.

These metrics close issue **#1110** ("\[indexer] Expose an ingestion-lag
metric with a documented alert threshold").

## Health Dashboard

The legacy Grafana draft linked from the orphaned root file
`Implement dashboard for indexer lag` lives at:

> https://www.figma.com/design/Yja14jB0ZqnCj09eG64A8E/Untitled?node-id=14-187&t=SgAZJM3WZOL62AAP-1

(That file has been removed from the repo; the design is preserved here
so the dashboard work it pointed at is not lost.)

## Metrics

The indexer exports two canonical gauges on `GET /metrics` (port 3002).
Both are `ObservableGauge`s backed by `LagProbeService`, which polls
Horizon every `LAG_PROBE_REFRESH_MS` (default 15&nbsp;s) and keeps the
network tip in an in-memory cache. Prom scrapes therefore never wait on
the network, even when Horizon is slow.

| Metric | Definition | Units |
|--------|------------|-------|
| `tikka_indexer_ingestion_lag_ledgers` | `latest_network_ledger_sequence − cursor.lastLedger` (clamped to 0) | ledgers |
| `tikka_indexer_ingestion_lag_seconds` | `latest_network_ledger.closedAt − cursor.lastSavedAt` (clamped to 0) | seconds |

Both return `0` while the probe is warming up (first 15&nbsp;s after boot)
or when the indexer has not yet persisted a cursor. The deprecated alias
`tikka_indexer_lag_ledgers` continues to be populated opportunistically
during the polling fallback so existing alerts and dashboards do not see
a gap during the migration.

## Alert Thresholds

| Alert | Expression | For | Severity | Rationale |
|-------|------------|-----|----------|-----------|
| `IndexerIngestionLagLedgers` | `tikka_indexer_ingestion_lag_ledgers > 50` | 5m | critical | Configurable via `INDEXER_LAG_ALERT_THRESHOLD_LEDGERS` (default 50). Mirrors `HealthService.lagAlertThreshold`. |
| `IndexerIngestionLagSeconds` | `tikka_indexer_ingestion_lag_seconds > 90` | 5m | warning | Configurable via `INDEXER_LAG_ALERT_THRESHOLD_SECONDS` (default 90). Catches stalls even when ledger sequences stop advancing. |
| `IndexerFallingBehind` (deprecated) | `tikka_indexer_lag_ledgers > 20` | 5m | critical | Legacy alias; migrate callers to `Index*LagLedgers`. |

The thresholds are also surfaced in the indexer's `/health` endpoint as
`lagStatus` (`healthy | degraded | critical`) and as the
`INDEXER_LAG_ALERT_THRESHOLD_LEDGERS` accessor on `HealthService`.

## Tunables

| Env var | Default | Used by |
|---------|---------|---------|
| `LAG_PROBE_REFRESH_MS` | `15000` (15 000 ms = 15 s) | `LagProbeService` — how often to refresh the cached network tip. Note the unit: it is **milliseconds**, not seconds; misconfiguring to `15` would hammer Horizon. |
| `LAG_PROBE_TIMEOUT_MS` | `4000`  (4 000 ms = 4 s) | `LagProbeService` — Horizon request timeout |
| `INDEXER_LAG_ALERT_THRESHOLD_LEDGERS` | `50` | Health-service `critical` transition + alert rule |
| `INDEXER_LAG_ALERT_THRESHOLD_SECONDS` | `90` | Alert rule (issue #1110) |
| `LAG_THRESHOLD` | `100` | Health-service `degraded` transition |

## Operator Playbook

When `IndexerIngestionLagLedgers` (critical) fires:

1. **Confirm the network is healthy.** Hit
   `curl https://<horizon>/ledgers?order=desc&limit=1` and check the
   latest sequence. If the tip is also stale, the issue is upstream of
   the indexer.
2. **Inspect the cursor.** `GET /health` should report the current
   `lag_ledgers` and `lagStatus`. A `cursor_integrity: error` means the
   cursor itself has been invalidated and must be reset (see the cursor
   integrity docs).
3. **Check the ingestor.** `GET /health/pipeline` exposes the pipeline
   state machine snapshot. `REORG_DETECTED → ROLLBACK_COMPLETE` followed
   by no recovery indicates a stuck reorg handler.
4. **Inspect DLQ pressure.** `GET /health/dlq-size` should not be
   growing unboundedly — a runaway DLQ can starve the dispatcher.
5. **Check SSE connectivity.** Open the indexer logs and look for
   `SSE Stream Error or Disconnect` — sustained SSE failures will
   repeatedly fall back to polling.
6. **Restart only as a last resort.** A reorg or cursor reset is
   preferable to a restart, which will have to re-read all of history
   from the new cursor.

When `IndexerIngestionLagSeconds` (warning) fires but
`IndexerIngestionLagLedgers` does not, the network is producing ledgers
slowly (or Horizon is returning stale `closed_at`s). Inspect `closed_at`
of the latest network ledger directly before paging anyone; the warning
is informational in that case.

## Cross-references

- `docs/observability/METRICS_MAP.md` — full indexer metric inventory
- `docs/observability/GRAFANA.md` — dashboard queries and panel thresholds
- `docs/observability/prometheus.yml` — consolidated scrape config
- `indexer/src/health/health.service.ts` — `/health` lag classifiers
- `indexer/src/metrics/lag-probe.service.ts` — implementation
- `indexer/src/metrics/metrics.service.ts` — ObservableGauge bindings
