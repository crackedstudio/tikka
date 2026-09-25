# Grafana Dashboards

All dashboards and Prometheus configuration live in this directory — one place,
so a metric renamed in code has exactly one set of panels to fix (#1480).

## Committed dashboards

| UID | File | Service | Panels |
|-----|------|---------|--------|
| `tikka-indexer` | [`indexer-dashboard.json`](indexer-dashboard.json) | Indexer | Ledger Lag, Events Processed Rate, Average Poll Duration, Error Rate, DLQ Depth, Memory Usage |
| `tikka-oracle` | [`oracle-dashboard.json`](oracle-dashboard.json) | Oracle | Submission Outcomes Rate, Fee Estimates vs Actual, Memory Usage, VRF Proof Success/Failure |
| `tikka-overview` | [`cross-service-dashboard.json`](cross-service-dashboard.json) | Cross-service | Events Rate, Submission Outcomes, Lag Comparison, Memory Comparison, Error Rate |

One dashboard per service, plus one cross-service overview. The indexer
previously had two — `dashboard.json` (uid `tikka-indexer`) and
`indexer-dashboard.json` (uid `tikka-indexer-health`) — with nothing to say which
was deployed. They are merged into the single `tikka-indexer` dashboard above,
which carries the union of their panels; `tikka-indexer-health` is retired, so
re-import rather than expecting that UID to resolve.

Every panel expression must name a metric listed in
[`METRICS_MAP.md`](METRICS_MAP.md). That is enforced, not merely asked for — see
"Validating panel queries" below.

The backend is not represented: it serves JSON from `GET /metrics`, not
Prometheus text, so its panels would need a JSON API data source. The
recommended layout is sketched under "Backend Dashboards" below.

---

## Oracle dashboard — panel reference

The oracle dashboard is committed as [`oracle-dashboard.json`](oracle-dashboard.json).
The panels below document what it contains, plus two panels that need a JSON API
data source and so are not part of the Prometheus dashboard.

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

### Panel: Ingestion Lag Comparison

**Queries:**

| Query | Source |
|-------|--------|
| `tikka_indexer_ingestion_lag_ledgers` | Indexer (:3002) |
| `tikka_indexer_ingestion_lag_seconds` | Indexer (:3002) |
| (future) `tikka_oracle_ingestion_lag_ledgers` | Oracle (:3003) |

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

## Prometheus configuration

The scrape config and alert rules are **not** duplicated here. They are the files
next to this one, and they are the only copies in the repository:

- [`prometheus.yml`](prometheus.yml) — scrape targets for indexer, oracle, and backend
- [`alerts.rules.yml`](alerts.rules.yml) — alert rules, loaded via `rule_files`

Both used to have a second, indexer-only copy under `indexer/prometheus/`, which
drifted: the oracle and backend targets existed in one file and not the other.
Edit these files; do not re-inline them into documentation.

## Validating panel queries

A dashboard panel that queries a metric the code no longer emits renders an empty
graph and says nothing about why. To catch that at review time rather than during
an incident, run:

```sh
node scripts/check-dashboard-metrics.js
```

It extracts every metric referenced by the dashboards and alert rules in this
directory, checks each one against the registry in
[`METRICS_MAP.md`](METRICS_MAP.md), and checks that each metric the registry
marks as emitted is actually created somewhere in the service source. Renaming a
metric in `indexer/src/metrics/` without updating the map and the panels fails
the check.
