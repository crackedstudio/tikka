# Metrics Implementation Summary

## Overview

Comprehensive metrics have been implemented for the Tikka indexer to monitor lag, processed events, failures, DLQ, retries, reorgs, database latency, and cache latency.

## What Was Built

### 1. Enhanced MetricsService (`indexer/src/metrics/metrics.service.ts`)

**New Metrics Added:**

#### Event Processing
- `tikka_indexer_events_processed_total` - Counter with labels: `event_type`, `outcome`
- `tikka_indexer_events_failed_total` - Counter with label: `event_type`
- `tikka_indexer_errors_total` - Counter with label: `error_type`

#### Lag and Reorg
- `tikka_indexer_lag_ledgers` - Gauge (existing, unchanged)
- `tikka_indexer_reorg_detected_total` - Counter (existing, unchanged)
- `tikka_indexer_poll_duration_seconds` - Histogram (existing, unchanged)

#### Database Performance
- `tikka_db_latency_seconds` - Histogram with label: `operation_type` (insert/select/update/delete)
- `tikka_db_query_duration_seconds` - Histogram with label: `operation` (specific operation name)
- `tikka_db_slow_query_total` - Counter with label: `operation`

#### Cache Performance
- `tikka_cache_hits_total` - Counter with label: `cache_type`
- `tikka_cache_misses_total` - Counter with label: `cache_type`
- `tikka_cache_latency_seconds` - Histogram with labels: `operation`, `cache_type`

#### Queue and DLQ
- `tikka_dlq_messages_total` - Counter with label: `queue_name`
- `tikka_retries_total` - Counter with labels: `queue_name`, `event_type`
- `tikka_queue_depth` - Gauge with label: `queue_name`

#### System
- `tikka_indexer_memory_usage_bytes` - Observable Gauge (existing, unchanged)

### 2. Updated Alert Rules (`indexer/prometheus/alerts.rules.yml`)

**New Alerts:**
- `HighEventFailureRate` - Triggers when event failure rate exceeds 5%
- `DLQMessagesAccumulating` - Triggers when DLQ receives >0.5 messages/sec
- `HighRetryRate` - Triggers when retry rate exceeds 1/sec
- `DatabaseHighLatency` - Triggers when p95 DB latency >1s
- `SlowDatabaseQueries` - Triggers when slow queries exceed 0.1/sec
- `CacheHighMissRate` - Triggers when cache miss rate >50%
- `CacheHighLatency` - Triggers when p95 cache latency >0.1s
- `QueueDepthHigh` - Triggers when queue depth >1000
- `ReorgDetected` - Info alert for ledger reorgs

**Existing Alerts (Unchanged):**
- `IndexerFallingBehind`
- `IndexerHighLatency`
- `IndexerErrors`

### 3. Comprehensive Grafana Dashboard (`indexer/grafana/indexer-dashboard.json`)

**14 Panels:**
1. Indexer Lag (Ledgers) - Gauge
2. Events Processed Rate by Type & Outcome - Time series
3. Event Failures Rate - Time series
4. Poll Duration - Time series
5. Error Rate by Type - Time series
6. Database Latency Percentiles (p50, p95, p99) - Time series
7. Slow Database Queries - Time series
8. Cache Latency Percentiles (p50, p95, p99) - Time series
9. Cache Miss Rate - Gauge
10. Queue Depth - Time series
11. DLQ Messages Rate - Time series
12. Retry Rate - Time series
13. Reorgs Detected (5m) - Time series
14. Memory Usage - Gauge

### 4. Test Suite (`indexer/src/metrics/metrics.service.spec.ts`)

Comprehensive unit tests covering:
- Event processing metrics
- Lag and reorg metrics
- Database metrics
- Cache metrics
- Queue and DLQ metrics
- Metrics export

### 5. Documentation

- **README.md** - Complete metrics documentation with usage examples
- **MIGRATION_GUIDE.md** - Step-by-step integration guide for existing code
- **metrics.integration.example.ts** - Example integration patterns

## Key Design Decisions

### Label Strategy

✅ **Low-cardinality labels used:**
- Event types (bounded set)
- Operation types (insert/select/update/delete)
- Queue names (fixed set)
- Cache types (redis/memory)
- Error types (categorized)
- Outcomes (success/partial/skipped)

❌ **High-cardinality labels avoided:**
- Transaction hashes
- User IDs
- Request IDs
- Timestamps
- Specific addresses

This prevents Prometheus memory issues and ensures fast queries.

### Metric Types

- **Counters**: For cumulative values (events processed, errors, retries)
- **Gauges**: For current values (lag, queue depth, memory)
- **Histograms**: For distributions (latency, duration)
- **Observable Gauges**: For system metrics (memory usage)

## Acceptance Criteria ✅

- [x] Metrics endpoint includes new counters/gauges
- [x] Dashboard JSON references valid metric names
- [x] Alert rules reference valid metric names
- [x] No high-cardinality labels used
- [x] Comprehensive test coverage
- [x] Documentation provided

## Verification

### Manual Testing

```bash
# 1. Start the indexer
cd indexer && npm run start:dev

# 2. Check metrics endpoint
curl http://localhost:3000/metrics | grep tikka_

# 3. Run tests
npm run test -- metrics.service.spec.ts

# 4. Lint check
npm run lint

# 5. Build check
npm run build
```

### Expected Metrics Output

```
# HELP tikka_indexer_events_processed_total Total number of events processed by type and outcome
# TYPE tikka_indexer_events_processed_total counter
tikka_indexer_events_processed_total{event_type="raffle_created",outcome="success"} 100

# HELP tikka_indexer_events_failed_total Total number of events that failed processing by type
# TYPE tikka_indexer_events_failed_total counter
tikka_indexer_events_failed_total{event_type="raffle_created"} 5

# HELP tikka_db_latency_seconds Database operation latency in seconds by operation type
# TYPE tikka_db_latency_seconds histogram
tikka_db_latency_seconds_bucket{operation_type="select",le="0.005"} 50
tikka_db_latency_seconds_bucket{operation_type="select",le="0.01"} 80
...

# HELP tikka_cache_hits_total Total number of cache hits by cache type
# TYPE tikka_cache_hits_total counter
tikka_cache_hits_total{cache_type="redis"} 1000

# HELP tikka_dlq_messages_total Total number of messages sent to dead letter queue by queue name
# TYPE tikka_dlq_messages_total counter
tikka_dlq_messages_total{queue_name="raffle-events"} 10
```

## Integration Steps

To integrate these metrics into your code:

1. Read `indexer/src/metrics/MIGRATION_GUIDE.md`
2. Review examples in `indexer/src/metrics/metrics.integration.example.ts`
3. Update processors, repositories, and cache services
4. Import Grafana dashboard
5. Configure Prometheus alerts
6. Test in staging environment

## Files Modified

- `indexer/src/metrics/metrics.service.ts` - Enhanced with new metrics
- `indexer/prometheus/alerts.rules.yml` - Added 9 new alert rules
- `indexer/grafana/indexer-dashboard.json` - Comprehensive 14-panel dashboard

## Files Created

- `indexer/src/metrics/metrics.service.spec.ts` - Test suite
- `indexer/src/metrics/README.md` - Metrics documentation
- `indexer/src/metrics/MIGRATION_GUIDE.md` - Integration guide
- `indexer/src/metrics/metrics.integration.example.ts` - Example patterns
- `indexer/METRICS_IMPLEMENTATION.md` - This summary

## Next Steps

1. **Review** - Review the implementation with the team
2. **Integrate** - Follow the migration guide to add metrics to existing code
3. **Deploy** - Deploy to staging and verify metrics collection
4. **Monitor** - Import Grafana dashboard and configure alerts
5. **Iterate** - Adjust thresholds based on production data

## Monitoring Best Practices

1. **Start with defaults** - Use the provided alert thresholds initially
2. **Tune over time** - Adjust based on actual production patterns
3. **Watch cardinality** - Monitor Prometheus memory usage
4. **Regular reviews** - Review dashboards weekly to identify trends
5. **Alert fatigue** - Disable noisy alerts and tune thresholds

## Support

For questions or issues:
- Check the README: `indexer/src/metrics/README.md`
- Review examples: `indexer/src/metrics/metrics.integration.example.ts`
- See migration guide: `indexer/src/metrics/MIGRATION_GUIDE.md`
