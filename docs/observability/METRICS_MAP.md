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

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `tikka_indexer_events_processed_total` | Counter | `event_type` | Total events processed by type |
| `tikka_indexer_errors_total` | Counter | (none) | Total errors during polling or processing |
| `tikka_indexer_reorg_detected_total` | Counter | (none) | Total ledger reorgs detected |
| `tikka_indexer_lag_ledgers` | Gauge | (none) | **[Deprecated alias]** Ledger lag behind the network; kept for backward compatibility, prefer `tikka_indexer_ingestion_lag_ledgers`. |
| `tikka_indexer_ingestion_lag_ledgers` | ObservableGauge | (none) | Ingestion lag in ledgers: `latest_network_ledger_sequence - cursor.lastLedger`. Refreshed every `LAG_PROBE_REFRESH_MS` (default 15s) via `LagProbeService`. **Alert when > `INDEXER_LAG_ALERT_THRESHOLD_LEDGERS` (default 50) for 5m (critical).** See [`docs/observability/INGESTION_LAG.md`](INGESTION_LAG.md). |
| `tikka_indexer_ingestion_lag_seconds` | ObservableGauge | (none) | Ingestion lag in seconds: `latest_network_ledger.closedAt - cursor.lastSavedAt`. Refreshed every `LAG_PROBE_REFRESH_MS` (default 15s). **Alert when > `INDEXER_LAG_ALERT_THRESHOLD_SECONDS` (default 90) for 5m (warning).** See [`docs/observability/INGESTION_LAG.md`](INGESTION_LAG.md). |
| `tikka_indexer_poll_duration_seconds` | Histogram | (none) | Duration of ledger polling cycles |
| `tikka_indexer_memory_usage_bytes` | ObservableGauge | (none) | Current heap used |
| `tikka_db_slow_query_total` | Counter | `query_hash` | Slow database queries |
| `tikka_db_query_duration_seconds` | Histogram | `query_hash` | Database query duration |
| `indexer_dlq_depth` | Gauge | `contract_address` | Current DLQ depth per contract |
| `indexer_dlq_events_total` | Counter | `reason`, `event_type` | Total DLQ events added/replayed |
| `tikka_indexer_queue_waiting` | Gauge | `queue` | Number of jobs waiting in queue |
| `tikka_indexer_queue_active` | Gauge | `queue` | Number of actively processing jobs |
| `tikka_indexer_queue_completed` | Gauge | `queue` | Number of completed jobs |
| `tikka_indexer_queue_failed` | Gauge | `queue` | Number of failed jobs |
| `tikka_indexer_queue_delayed` | Gauge | `queue` | Number of delayed jobs |
| `tikka_indexer_queue_paused` | Gauge | `queue` | Number of paused jobs |
| `tikka_indexer_queue_oldest_job_age_seconds` | Gauge | `queue` | Age of oldest waiting job in seconds |
| `tikka_indexer_queue_total` | Gauge | `queue` | Total jobs across all states |

### Prometheus Scrape Config

```yaml
scrape_configs:
  - job_name: 'tikka-indexer'
    static_configs:
      - targets: ['localhost:3002']
    metrics_path: '/metrics'
```

### Prometheus Alert Rules

| Alert Name | Expression | Severity |
|------------|-----------|----------|
| `IndexerIngestionLagLedgers` | `tikka_indexer_ingestion_lag_ledgers > 50` for 5m | critical |
| `IndexerIngestionLagSeconds` | `tikka_indexer_ingestion_lag_seconds > 90` for 5m | warning |
| `IndexerFallingBehind` | `tikka_indexer_lag_ledgers > 20` for 5m (deprecated alias) | critical |
| `IndexerHighLatency` | avg poll duration > 10s for 10m | warning |
| `IndexerErrors` | error rate > 0.1/s for 2m | warning |
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

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `tikka_oracle_estimated_fee_stroops` | Gauge | `network`, `method` | Estimated fee for next submission |
| `tikka_oracle_actual_fee_total_stroops` | Counter | `network`, `method` | Total actual fee paid for submissions |
| `tikka_oracle_submission_outcome_total` | Counter | `outcome`, `network`, `method` | Submission outcomes (success/failure/retry) |
| `tikka_oracle_component_heartbeat_unixtime` | Gauge | `component` | Unix seconds of last main-loop activity (`listener`, `queue`, `submitter`) |
| `tikka_oracle_memory_usage_bytes` | ObservableGauge | (none) | Current heap used |

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
| `x-request-id` (header) | Generated per request, logged + echoed on response | Read from inbound header, stamped on every log line | Read from inbound header / peer `x-request-id` into `correlationId` |
| `requestId` | Log field, Sentry tag, error-response body | Log field (same value as `x-request-id`) | Log field (`correlationId`), queue metadata |
| `raffleId` | DB field (`oracle_jobs`) | — | Log field, queue metadata |
| `txHash` | DB field (`oracle_jobs`) | — | Log field, `TransactionOutcome` |
| `ledger` | Log field | Log field, metric context | Queue metadata |
| `eventType` | — | Metric label (`event_type`) | — |
| `jobId` | DB field | — | Queue metadata |

### Trace header propagation

The canonical correlation id is **`x-request-id`** (W3C-style request id; not the
full `traceparent`, but compatible with it). Propagation path:

1. **Backend** — `RequestIdMiddleware` generates an `x-request-id` if the caller
   did not supply one, stores it in an `AsyncLocalStorage` request context, and
   echoes it on the response. `RequestLoggingInterceptor` and
   `BaseExceptionFilter` attach it to every log line and to the error-response
   body (`requestId`), so a user-reported id maps straight back to backend logs.
2. **Backend → Indexer** — `IndexerService` forwards the active `x-request-id`
   as a request header on every `fetch` call. The indexer's
   `RequestIdMiddleware` reuses that id (falling back to a generated one) and the
   indexer's `RequestLoggerService` stamps it on every log line, so a single id
   spans backend + indexer for one logical operation.
3. **Indexer outbound** — webhook fan-out forwards the same `x-request-id` to
   downstream webhook consumers.
4. **Oracle** — the draw's `request_id` arrives from the on-chain event (and, for
   multi-oracle, peer `/vrf/compute` calls forward `x-request-id`). The event
   listener runs the draw handler inside `CorrelationContext.run(requestId, …)`
   and the randomness worker uses `requestId` as its `correlationId`, so every
   oracle log for that draw carries the same id.

> To correlate a failed raffle draw end-to-end: take the `requestId` from the
> backend error response, then grep backend, indexer, and oracle logs for that
> value (backend/indexer: `x-request-id` / `requestId`; oracle: `correlationId`
> and `request_id` fields).
