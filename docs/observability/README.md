# Observability Standards

This document defines the shared metric naming conventions, log field taxonomy, and label-cardinality rules that all Tikka services (backend, indexer, oracle) must follow.

## Metric Naming Convention

All Prometheus-exported metrics must follow this pattern:

```
tikka_<service>_<noun>_[<unit>]
```

| Component | Pattern | Example |
|-----------|---------|---------|
| Backend | `tikka_backend_<noun>_<unit>` | `tikka_backend_metadata_cache_hits` |
| Indexer | `tikka_indexer_<noun>_<unit>` | `tikka_indexer_events_processed_total` |
| Oracle | `tikka_oracle_<noun>_<unit>` | `tikka_oracle_estimated_fee_stroops` |

### Metric Suffix Conventions

| Suffix | Type | When to use |
|--------|------|-------------|
| `_total` | Counter | Cumulative counts (events, errors, jobs) |
| `_seconds` | Histogram | Duration measurements |
| `_bytes` | Gauge | Memory, storage size |
| `_stroops` | Gauge / Counter | Stellar fee amounts |
| _No suffix_ | Gauge | Instantaneous values (lag, depth) |

### Accepted Metric Types

| Type | Use case | Zero-value semantics |
|------|----------|---------------------|
| Counter | Monotonic accumulators (events processed, errors) | `rate()` / `increase()` |
| Gauge | Snapshots (lag, memory, queue depth) | `avg_over_time()` |
| Histogram | Distribution (poll duration, query duration) | `histogram_quantile()` |
| ObservableGauge | Auto-polled values (memory) | Instant read |

## Shared Metric Names

These metrics must be implemented identically across all services that expose them:

| Metric Name | Services | Type | Labels |
|-------------|----------|------|--------|
| `tikka_*_memory_usage_bytes` | indexer, oracle | ObservableGauge | (none) |
| `tikka_*_lag_ledgers` | indexer, oracle (planned) | Gauge | (none) |
| `tikka_*_events_processed_total` | indexer | Counter | `event_type` |
| `tikka_*_errors_total` | indexer | Counter | (none) |
| `tikka_*_submission_outcome_total` | oracle | Counter | `outcome`, `network`, `method` |
| `tikka_*_estimated_fee_stroops` | oracle | Gauge | `network`, `method` |
| `tikka_*_actual_fee_total_stroops` | oracle | Counter | `network`, `method` |
| `tikka_*_poll_duration_seconds` | indexer | Histogram | (none) |
| `tikka_*_query_duration_seconds` | indexer | Histogram | `query_hash` |
| `tikka_*_slow_query_total` | indexer | Counter | `query_hash` |

## Log Field Taxonomy

All structured log output must use these canonical field names:

### Correlation Fields

| Field | Type | Example | Services |
|-------|------|---------|----------|
| `requestId` | string (UUID) | `"a1b2c3d4-..."` | backend, oracle |
| `raffleId` | integer | `42` | backend, indexer, oracle |
| `txHash` | string (hex) | `"abc123..."` | backend, indexer, oracle |
| `ledger` | integer | `1234567` | backend, indexer, oracle |
| `jobId` | string | `"job_abc123"` | backend, oracle |
| `eventType` | string | `"RaffleCreated"` | indexer |
| `eventId` | string | `"123-456"` | indexer |

### Performance Fields

| Field | Type | Example |
|-------|------|---------|
| `durationMs` | integer | `150` |
| `latencyMs` | integer | `3200` |
| `attempt` | integer | `3` |
| `elapsedMs` | integer | `500` |

### Outcome Fields

| Field | Type | Example |
|-------|------|---------|
| `outcome` | string | `"succeeded"`, `"failed"`, `"skipped"` |
| `status` | string | `"ok"`, `"degraded"`, `"error"` |
| `error` | string | `"timeout"` |
| `reason` | string | `"HANDLER_ERROR"` |

### Context Fields

| Field | Type | Example |
|-------|------|---------|
| `network` | string | `"testnet"`, `"mainnet"` |
| `method` | string | `"PRNG"`, `"VRF"` |
| `contractId` | string (hex) | `"CAFEDEAD..."` |
| `handler` | string | `"RaffleProcessor.handleRaffleCreated"` |

### Audit Fields

| Field | Type | Example |
|-------|------|---------|
| `adminId` | string | `"admin_uuid"` |
| `route` | string | `"/monitor/jobs"` |
| `method` | string | `"GET"` |
| `statusCode` | integer | `200` |

## Label Cardinality Rules

### Safe Labels (low/medium cardinality)

These labels are safe to use on any metric:

| Label | Max unique values | Example values |
|-------|-------------------|----------------|
| `event_type` | < 50 | `RaffleCreated`, `TicketPurchased` |
| `outcome` | < 10 | `success`, `failure`, `retry` |
| `network` | < 5 | `testnet`, `mainnet` |
| `method` | < 10 | `PRNG`, `VRF`, `average` |
| `query_hash` | < 200 | SHA-256 of normalized SQL |
| `status` | < 10 | `healthy`, `degraded`, `unhealthy` |

### Unsafe Labels (high cardinality — DO NOT USE)

These values must never be used as metric labels:

| Value | Reason | Alternative |
|-------|--------|-------------|
| `raffleId` | Unbounded; one per raffle | Use in log fields only |
| `requestId` | Unique per request | Use in log fields only |
| `txHash` | Unique per transaction | Use in log fields only |
| `userAddress` | Unique per user | Use in log fields only |
| `ip` | Unique per request + PII | Use in logs only, with redaction |

### High-Cardinality Sources

Avoid these as metric label dimensions:

- **Timestamps** — never use a raw timestamp as a label value. Use log fields or span attributes instead.
- **User-supplied strings** — never use free-form user input as a label.
- **Session/token IDs** — unique per session; cardinality grows unbounded.
- **Error messages** — use an error "type" or "code" enum instead of the full message text.

## Metric Endpoints

| Service | Endpoint | Format | Port |
|---------|----------|--------|------|
| Backend | `GET /metrics` | JSON (custom) | 3001 |
| Indexer | `GET /metrics` | Prometheus text | 3002 |
| Oracle | `GET /metrics` | Prometheus text | 3003 |
