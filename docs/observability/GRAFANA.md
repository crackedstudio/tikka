# Grafana Dashboards

## Current Dashboards

### Indexer Dashboards

| UID | File | Panels |
|-----|------|--------|
| `tikka-indexer` | `indexer/grafana/dashboard.json` | Events Processed Rate, Indexer Lag, Error Rate, Memory Usage |
| `tikka-indexer-health` | `indexer/grafana/indexer-dashboard.json` | Indexer Lag (Gauge), Events Processed Rate by Type, Average Poll Duration |

#### Dashboard: `tikka-indexer` (uid: tikka-indexer)

| Panel | Query | Type |
|-------|-------|------|
| Events Processed Rate | `rate(tikka_indexer_events_processed_total[5m])` | Timeseries |
| Indexer Lag (Ledgers) | `tikka_indexer_lag_ledgers` | Timeseries |
| Error Rate | `rate(tikka_indexer_errors_total[5m])` | Timeseries |
| Memory Usage | `tikka_indexer_memory_usage_bytes` | Timeseries |

#### Dashboard: `tikka-indexer-health` (uid: tikka-indexer-health)

| Panel | Query | Type | Thresholds |
|-------|-------|------|------------|
| Indexer Lag (Ledgers) | `tikka_indexer_lag_ledgers` | Gauge | 10 (yellow), 50 (red) |
| Events Processed Rate (per min) | `sum by (event_type) (rate(tikka_indexer_events_processed_total[1m]))` | Timeseries | — |
| Average Poll Duration | `rate(tikka_indexer_poll_duration_seconds_sum[1m]) / rate(tikka_indexer_poll_duration_seconds_count[1m])` | Timeseries | — |

### Oracle Dashboards

The oracle exports Prometheus metrics at `GET /metrics` (port 3003) but does **not** currently have a committed Grafana dashboard JSON. A recommended dashboard layout is provided below.

---

## Oracle Dashboard (Recommended)

### Dashboard UID: `tikka-oracle`

### Panel: Submission Outcomes (Rate)

**Query:** `sum by (outcome) (rate(tikka_oracle_submission_outcome_total[5m]))`

Visualize success/failure/retry rates to spot submission issues.

### Panel: Fee Estimates vs Actual

**Query A:** `tikka_oracle_estimated_fee_stroops`
**Query B:** `rate(tikka_oracle_actual_fee_total_stroops[5m])`

Overlay estimated vs actual fee to detect cost anomalies.

### Panel: Queue Depth (by State)

**Query:** (Not in Prometheus — consumes `GET /queue/metrics` via JSON API data source)

Shows `pendingCount`, `failedCount`, `deadLetteredCount` as stacked series.

### Panel: Memory Usage

**Query:** `tikka_oracle_memory_usage_bytes`

Standard heap monitoring.

### Panel: Component Health

**Data source:** `GET /oracle/components` (JSON API)

Heatmap of component status: listener, queue, key provider, randomness provider, network, submitter.

---

## Backend Dashboards

The backend does **not** currently have a committed Grafana dashboard JSON. It exports:

- `GET /metrics` (JSON) — `metadata_cache_hits` counter
- `GET /health` (JSON) — push delivery failure metrics
- `GET /monitor/*` (JSON) — job queue stats, latency, errors, audit log

A recommended dashboard layout is provided below.

### Dashboard UID: `tikka-backend`

### Panel: Push Notification Failures

**Data source:** `GET /health` (JSON API)

Breakdown of `pushDelivery` metrics: `transientRetry`, `permanentInvalidToken`, `permanentOther`, `providerOutage`.

### Panel: Oracle Job Queue

**Data source:** `GET /monitor/stats` (JSON API)

Pending / completed / failed job counts as a stacked bar chart.

### Panel: Job Latency (P50/P95/P99)

**Data source:** `GET /monitor/latency` (JSON API)

Timeseries of job latency in milliseconds.

---

## Cross-Service Correlation Dashboard (Recommended)

### Dashboard UID: `tikka-overview`

This dashboard correlates events across backend, indexer, and oracle in a single view.

### Panel: End-to-End Events Rate

**Queries:**

| Query | Prometheus Source |
|-------|------------------|
| `rate(tikka_indexer_events_processed_total[5m])` | Indexer (:3002) |
| `sum by (outcome) (rate(tikka_oracle_submission_outcome_total[5m]))` | Oracle (:3003) |

### Panel: Lag Comparison

**Queries:**

| Query | Source |
|-------|--------|
| `tikka_indexer_lag_ledgers` | Indexer (:3002) |
| (future) `tikka_oracle_lag_ledgers` | Oracle (:3003) |

### Panel: Error Rate Comparison

**Queries:**

| Query | Source |
|-------|--------|
| `rate(tikka_indexer_errors_total[5m])` | Indexer (:3002) |
| (future) oracle submission failure rate | Oracle (:3003) |

### Panel: Memory Comparison

**Queries:**

| Query | Source |
|-------|--------|
| `tikka_indexer_memory_usage_bytes` | Indexer (:3002) |
| `tikka_oracle_memory_usage_bytes` | Oracle (:3003) |

### Variables

| Variable | Definition | Purpose |
|----------|------------|---------|
| `$event_type` | `label_values(tikka_indexer_events_processed_total, event_type)` | Filter indexer events by type |
| `$outcome` | `label_values(tikka_oracle_submission_outcome_total, outcome)` | Filter oracle outcomes |

---

## Prometheus Scrape Config (Full)

A consolidated Prometheus scrape config for all three services:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'tikka-indexer'
    static_configs:
      - targets: ['localhost:3002']
    metrics_path: '/metrics'

  - job_name: 'tikka-oracle'
    static_configs:
      - targets: ['localhost:3003']
    metrics_path: '/metrics'

  - job_name: 'tikka-backend'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/metrics'
    # Backend returns JSON, not Prometheus format.
    # Use Prometheus static_config or a Prometheus `json` exporter.
```

## Prometheus Alert Rules (Consolidated)

```yaml
groups:
  - name: tikka-indexer-alerts
    rules:
      - alert: IndexerFallingBehind
        expr: tikka_indexer_lag_ledgers > 20
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Indexer is lagging behind the Stellar network"

      - alert: IndexerHighLatency
        expr: rate(tikka_indexer_poll_duration_seconds_sum[5m]) / rate(tikka_indexer_poll_duration_seconds_count[5m]) > 10
        for: 10m
        labels:
          severity: warning

      - alert: IndexerErrors
        expr: rate(tikka_indexer_errors_total[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
```
