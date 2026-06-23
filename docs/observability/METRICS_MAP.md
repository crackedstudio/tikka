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
| `tikka_indexer_lag_ledgers` | Gauge | (none) | Current ledger lag behind the network |
| `tikka_indexer_poll_duration_seconds` | Histogram | (none) | Duration of ledger polling cycles |
| `tikka_indexer_memory_usage_bytes` | ObservableGauge | (none) | Current heap used |
| `tikka_db_slow_query_total` | Counter | `query_hash` | Slow database queries |
| `tikka_db_query_duration_seconds` | Histogram | `query_hash` | Database query duration |

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
| `IndexerFallingBehind` | `tikka_indexer_lag_ledgers > 20` for 5m | critical |
| `IndexerHighLatency` | avg poll duration > 10s for 10m | warning |
| `IndexerErrors` | error rate > 0.1/s for 2m | warning |

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
| `tikka_oracle_memory_usage_bytes` | ObservableGauge | (none) | Current heap used |

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
