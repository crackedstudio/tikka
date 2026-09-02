# Metrics Map

Complete inventory of all metrics endpoints, Prometheus metrics, and health endpoints across backend, indexer, and oracle services.

---

## Backend

**Port:** 3001  
**Metrics library:** In-process counters (no Prometheus client)  
**Format:** Application/JSON

### Endpoints

| Route | Response | Auth |
|-------|----------|------|
| `GET /metrics` | `{ "metadata_cache_hits": number }` | Public |
| `GET /health` | Health check + push notification delivery metrics | Public |
| `GET /monitor/stats` | Queue stats from `oracle_jobs` table | Admin |
| `GET /monitor/jobs` | Paginated oracle job listing | Admin |
| `GET /monitor/latency` | Job latency time-series (from `enqueued_at` / `confirmed_at`) | Admin |
| `GET /monitor/errors` | Failed job error records | Admin |
| `GET /monitor/audit` | Admin audit log entries | Admin |
| `GET /monitor/maintenance` | Maintenance mode status | Admin |

### In-Process Metrics

| Name | Type | Source | Description |
|------|------|--------|-------------|
| `metadata_cache_hits` | Counter | `MetadataCacheMetricsService` | Total metadata cache hits since process start |

### Health Metrics

| Field | Source | Description |
|-------|--------|-------------|
| `pushDelivery.transientRetry` | `PushNotificationService` | Transient retry count |
| `pushDelivery.permanentInvalidToken` | `PushNotificationService` | Expired/invalid token count |
| `pushDelivery.permanentOther` | `PushNotificationService` | Other permanent failure count |
| `pushDelivery.providerOutage` | `PushNotificationService` | Provider outage count |
| `pushDelivery.totalFailures` | `PushNotificationService` | Total failure count |

For ingestion-lag alert thresholds and the runbook, see [`docs/observability/INGESTION_LAG.md`](INGESTION_LAG.md).

### Monitor (DB-Backed) Fields

| Entity | Fields |
|--------|--------|
| `OracleJob` | `id`, `status`, `enqueuedAt`, `updatedAt`, `confirmedAt`, `latencyMs`, `xdr`, `errorMessage` |
| `LatencyPoint` | `jobId`, `enqueuedAt`, `confirmedAt`, `latencyMs` |
| `ErrorRecord` | `jobId`, `failedAt`, `errorMessage`, `xdr` |
| `AuditLogEntry` | `adminId`, `route`, `method`, `statusCode`, `timestamp` |
| `QueueStatsResponse` | `pending`, `completed`, `failed`, `timestamp` |

---

## Indexer

**Port:** 3002  
**Metrics library:** OpenTelemetry SDK (`@opentelemetry/sdk-metrics`) with PrometheusExporter  
**Meter name:** `tikka-indexer`  
**Format:** Prometheus text (`Content-Type: text/plain; version=0.0.4`)

### Endpoints

| Route | Response | Auth |
|-------|----------|------|
| `GET /metrics` | Prometheus-formatted metrics | Public |
| `GET /health` | `{ status, lag_ledgers, lagStatus, db, redis, redis_latency_ms, dlq_size }` | Public |
| `GET /health/dlq-size` | `{ dlq_size: number }` | Public |

### Prometheus Metrics

`Status` is what makes this table a registry rather than a wish list:
**Emitted** means a service actually creates the instrument, **Planned** means it
is designed but not yet implemented. `scripts/check-dashboard-metrics.js` enforces
both directions — an Emitted metric must exist in the source, and no dashboard
panel may query a Planned one.

| Metric Name | Type | Status | Labels | Description |
|-------------|------|--------|--------|-------------|
| `tikka_indexer_events_processed_total` | Counter | Emitted | `event_type` | Total events processed by type |
| `tikka_indexer_errors_total` | Counter | Emitted | (none) | Total errors during polling or processing |
| `tikka_indexer_reorg_detected_total` | Counter | Emitted | (none) | Total ledger reorgs detected |
| `tikka_indexer_lag_ledgers` | Gauge | Emitted | (none) | Ledger lag behind the network tip. Updated opportunistically when the SSE stream falls back to polling. One of two non-conforming aliases for the same quantity — see the note below. |
| `indexer_ledger_lag` | Gauge | Emitted | (none) | The second alias for ledger lag. Does not carry the `tikka_` prefix the naming convention requires. Charted alongside `tikka_indexer_lag_ledgers` on the indexer dashboard so a divergence between the two update paths is visible. |
| `tikka_indexer_ingestion_lag_ledgers` | ObservableGauge | **Planned** | (none) | Ingestion lag in ledgers: `latest_network_ledger_sequence - cursor.lastLedger`, refreshed via `LagProbeService`. `LagProbeService` exists and caches the network tip, but no gauge is registered against it yet, so this metric is **not currently exported**. Intended to replace both aliases above. See [`INGESTION_LAG.md`](INGESTION_LAG.md). |
| `tikka_indexer_ingestion_lag_seconds` | ObservableGauge | **Planned** | (none) | Ingestion lag in seconds: `latest_network_ledger.closedAt - cursor.lastSavedAt`. Not currently exported, for the same reason. See [`INGESTION_LAG.md`](INGESTION_LAG.md). |
| `tikka_indexer_poll_duration_seconds` | Histogram | Emitted | (none) | Duration of ledger polling cycles |
| `tikka_indexer_memory_usage_bytes` | ObservableGauge | Emitted | (none) | Current heap used |
| `tikka_db_slow_query_total` | Counter | Emitted | `query_hash` | Slow database queries |
| `tikka_db_query_duration_seconds` | Histogram | Emitted | `query_hash` | Database query duration |
| `indexer_dlq_depth` | Gauge | Emitted | `contract_address` | Current DLQ depth per contract |
| `indexer_dlq_events_total` | Counter | Emitted | `reason`, `event_type` | Total DLQ events added/replayed |
| `tikka_indexer_queue_waiting` | Gauge | Emitted | `queue` | Number of jobs waiting in queue |
| `tikka_indexer_queue_active` | Gauge | Emitted | `queue` | Number of actively processing jobs |
| `tikka_indexer_queue_completed` | Gauge | Emitted | `queue` | Number of completed jobs |
| `tikka_indexer_queue_failed` | Gauge | Emitted | `queue` | Number of failed jobs |
| `tikka_indexer_queue_delayed` | Gauge | Emitted | `queue` | Number of delayed jobs |
| `tikka_indexer_queue_paused` | Gauge | Emitted | `queue` | Number of paused jobs |
| `tikka_indexer_queue_oldest_job_age_seconds` | Gauge | Emitted | `queue` | Age of oldest waiting job in seconds |
| `tikka_indexer_queue_total` | Gauge | Emitted | `queue` | Total jobs across all states |

### Prometheus Scrape Config

See [`prometheus.yml`](prometheus.yml) — the single scrape config for the whole
stack. It is deliberately not reproduced here.

### Prometheus Alert Rules

Defined in [`alerts.rules.yml`](alerts.rules.yml), loaded by
[`prometheus.yml`](prometheus.yml) via `rule_files`:

| Alert Name | Expression | Severity |
|------------|-----------|----------|
| `IndexerFallingBehind` | `tikka_indexer_lag_ledgers > 20` for 5m | critical |
| `IndexerLedgerLagHigh` | `indexer_ledger_lag > 100` for 5m | critical |
| `IndexerHighLatency` | avg poll duration > 10s for 10m | warning |
| `IndexerErrors` | `rate(tikka_indexer_errors_total[5m]) > 0.1` for 2m | warning |

Proposed but **not yet defined** in `alerts.rules.yml` — the queue metrics are
exported, so these only need writing:

| Alert Name | Expression | Severity |
|------------|-----------|----------|
| `IndexerQueueBacklog` | `tikka_indexer_queue_waiting > 100` for 5m | warning |
| `IndexerQueueStalled` | `tikka_indexer_queue_oldest_job_age_seconds > 300` for 5m | critical |
| `IndexerQueueFailureRate` | `rate(tikka_indexer_queue_failed[5m]) > 0.1` for 5m | warning |

---

## Oracle

**Port:** 3003  
**Metrics library:** OpenTelemetry SDK (`@opentelemetry/sdk-metrics`) with PrometheusExporter  
**Meter name:** `tikka-oracle`  
**Format:** Prometheus text (`Content-Type: text/plain; version=0.0.4`)

### Endpoints

| Route | Response | Auth |
|-------|----------|------|
| `GET /metrics` | Prometheus-formatted metrics | Public |
| `GET /health` | `{ status, timestamp, pendingLagRequests }` | Public |
| `GET /oracle/components` | Component-level health with stats | Public |
| `GET /oracle/status` | Full status with RPC health, lag, multi-oracle config | Public |
| `GET /queue/metrics` | In-memory queue metrics by job state | Public |
| `GET /queue/health` | Queue health status with pending/failed/dead-lettered counts | Public |
| `GET /queue/jobs/:state` | Jobs in a specific state | Public |
| `GET /queue/dead-letter` | Dead-lettered jobs requiring rescue | Public |
| `GET /queue/config` | Queue configuration | Public |

### Prometheus Metrics

| Metric Name | Type | Status | Labels | Description |
|-------------|------|--------|--------|-------------|
| `tikka_oracle_estimated_fee_stroops` | Gauge | Emitted | `network`, `method` | Estimated fee for next submission |
| `tikka_oracle_actual_fee_total_stroops` | Counter | Emitted | `network`, `method` | Total actual fee paid for submissions |
| `tikka_oracle_submission_outcome_total` | Counter | Emitted | `outcome`, `network`, `method` | Submission outcomes (success/failure/retry) |
| `tikka_oracle_fee_bumps_total` | Counter | Emitted | `network`, `method` | Fee-bump transactions issued for stuck submissions |
| `tikka_oracle_component_heartbeat_unixtime` | Gauge | Emitted | `component` | Unix seconds of last main-loop activity (`listener`, `queue`, `submitter`) |
| `tikka_oracle_memory_usage_bytes` | ObservableGauge | Emitted | (none) | Current heap used |
| `oracle_vrf_proofs_total` | Counter | Emitted | (none) | VRF proofs generated successfully. Charted on the oracle dashboard. Missing the `tikka_` prefix the convention requires. |
| `oracle_vrf_failures_total` | Counter | Emitted | `reason` | VRF proof generation failures by reason. Missing the `tikka_` prefix. |
| `oracle_event_listener_gaps_total` | Counter | Emitted | (none) | Gaps detected in the Horizon event stream. Missing the `tikka_` prefix. |
| `oracle_event_listener_backfill_events_total` | Counter | Emitted | (none) | Events recovered by backfill after a stream gap. Missing the `tikka_` prefix. |

Four oracle metrics above predate the `tikka_<service>_` naming convention in
[`README.md`](README.md). Renaming them is a breaking change for any dashboard or
alert already pointing at them, so they are recorded here as they actually are
rather than as they should be.

### Component heartbeat (liveness)

Each oracle component updates `tikka_oracle_component_heartbeat_unixtime{component=...}` on every main-loop iteration:

| Component | Updated when | Expected cadence |
|-----------|--------------|------------------|
| `listener` | Each Horizon SSE message handled | Continuously while the stream is connected (often sub-second when events flow; stalls if the stream wedges) |
| `queue` | Each Bull job the randomness worker starts | Per job; stalls if the worker stops consuming |
| `submitter` | Each `submitRandomnessTyped` entry | Per submission attempt; stalls if the submit path wedges |

**Suggested Prometheus alert** (component wedged while process still up):

```yaml
- alert: OracleComponentHeartbeatStale
  expr: |
    (time() - tikka_oracle_component_heartbeat_unixtime) > 120
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "Oracle {{ $labels.component }} heartbeat is stale"
    description: >
      Component {{ $labels.component }} has not updated its heartbeat for >120s.
      The process may still look alive while this loop is wedged.
```

Tune the threshold to your expected idle periods (raise it if the queue/submitter can be legitimately idle longer than 2 minutes).

### In-Memory Queue Metrics

| Field | Description |
|-------|-------------|
| `queuedCount` | Jobs awaiting processing |
| `generatingCount` | Jobs generating randomness |
| `submittingCount` | Jobs submitting transactions |
| `confirmingCount` | Jobs waiting for confirmation |
| `retryingCount` | Jobs in backoff before retry |
| `confirmedCount` | Terminal success |
| `failedCount` | Terminal failure |
| `deadLetteredCount` | Exhausted retries, needs rescue |
| `pendingCount` | Queued + generating + submitting + confirming + retrying |
| `totalFailedCount` | Failed + dead-lettered |

---

## Cross-Service Correlation Map

Events flow across services. Use these fields to correlate:

| Correlation Key | Backend | Indexer | Oracle |
|----------------|---------|---------|--------|
| `requestId` | Log field, Sentry tag | — | Log field (`TelemetryContext`) |
| `raffleId` | DB field (`oracle_jobs`) | — | Log field, queue metadata |
| `txHash` | DB field (`oracle_jobs`) | — | Log field, `TransactionOutcome` |
| `ledger` | Log field | Log field, metric context | Queue metadata |
| `eventType` | — | Metric label (`event_type`) | — |
| `jobId` | DB field | — | Queue metadata |
