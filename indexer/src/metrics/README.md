# Indexer Metrics

This document describes the metrics exposed by the Tikka indexer for monitoring and alerting.

## Metrics Endpoint

Metrics are exposed in Prometheus format at `/metrics` endpoint.

## Available Metrics

### Event Processing Metrics

#### `tikka_indexer_events_processed_total`
- **Type**: Counter
- **Description**: Total number of events processed
- **Labels**:
  - `event_type`: Type of event (e.g., `raffle_created`, `ticket_purchased`, `raffle_ended`)
  - `outcome`: Processing outcome (`success`, `partial`, `skipped`)
- **Usage**: Track event processing throughput and success rates

#### `tikka_indexer_events_failed_total`
- **Type**: Counter
- **Description**: Total number of events that failed processing
- **Labels**:
  - `event_type`: Type of event that failed
- **Usage**: Monitor event processing failures

#### `tikka_indexer_errors_total`
- **Type**: Counter
- **Description**: Total number of errors encountered
- **Labels**:
  - `error_type`: Type of error (e.g., `parsing_error`, `network_error`, `validation_error`)
- **Usage**: Track error rates by type

### Lag and Reorg Metrics

#### `tikka_indexer_lag_ledgers`
- **Type**: Gauge
- **Description**: Current ledger lag behind the network
- **Labels**: None
- **Usage**: Monitor how far behind the indexer is from the network tip

#### `tikka_indexer_reorg_detected_total`
- **Type**: Counter
- **Description**: Total number of ledger reorganizations detected
- **Labels**: None
- **Usage**: Track blockchain reorganization events

#### `tikka_indexer_poll_duration_seconds`
- **Type**: Histogram
- **Description**: Duration of ledger polling cycles
- **Labels**: None
- **Usage**: Monitor polling performance and latency

### Database Metrics

#### `tikka_db_latency_seconds`
- **Type**: Histogram
- **Description**: Database operation latency
- **Labels**:
  - `operation_type`: Type of operation (`insert`, `select`, `update`, `delete`)
- **Usage**: Monitor database performance by operation type

#### `tikka_db_query_duration_seconds`
- **Type**: Histogram
- **Description**: Database query duration
- **Labels**:
  - `operation`: Specific operation name (e.g., `select_raffles`, `insert_ticket`)
- **Usage**: Track query performance for specific operations

#### `tikka_db_slow_query_total`
- **Type**: Counter
- **Description**: Total number of slow database queries
- **Labels**:
  - `operation`: Operation that was slow
- **Usage**: Identify slow queries that need optimization

### Cache Metrics

#### `tikka_cache_hits_total`
- **Type**: Counter
- **Description**: Total number of cache hits
- **Labels**:
  - `cache_type`: Type of cache (`redis`, `memory`, `default`)
- **Usage**: Monitor cache effectiveness

#### `tikka_cache_misses_total`
- **Type**: Counter
- **Description**: Total number of cache misses
- **Labels**:
  - `cache_type`: Type of cache
- **Usage**: Track cache miss rate

#### `tikka_cache_latency_seconds`
- **Type**: Histogram
- **Description**: Cache operation latency
- **Labels**:
  - `operation`: Cache operation (`get`, `set`, `delete`)
  - `cache_type`: Type of cache
- **Usage**: Monitor cache performance

### Queue and DLQ Metrics

#### `tikka_dlq_messages_total`
- **Type**: Counter
- **Description**: Total number of messages sent to dead letter queue
- **Labels**:
  - `queue_name`: Name of the queue (e.g., `raffle-events`, `ticket-events`)
- **Usage**: Monitor failed message processing

#### `tikka_retries_total`
- **Type**: Counter
- **Description**: Total number of retry attempts
- **Labels**:
  - `queue_name`: Name of the queue
  - `event_type`: Type of event being retried
- **Usage**: Track retry patterns and potential issues

#### `tikka_queue_depth`
- **Type**: Gauge
- **Description**: Current queue depth
- **Labels**:
  - `queue_name`: Name of the queue
- **Usage**: Monitor queue backlog

### System Metrics

#### `tikka_indexer_memory_usage_bytes`
- **Type**: Observable Gauge
- **Description**: Current memory usage (heap used)
- **Labels**: None
- **Usage**: Monitor memory consumption

## Label Guidelines

### Avoid High-Cardinality Labels

**DO NOT** use labels with high cardinality such as:
- Transaction hashes
- User IDs
- Timestamps
- Request IDs
- Specific addresses

These can cause memory issues in Prometheus and slow down queries.

### Recommended Label Values

Use labels with bounded, predictable cardinality:
- Event types (limited set of event names)
- Operation types (insert, select, update, delete)
- Queue names (fixed set of queues)
- Cache types (redis, memory)
- Error types (categorized error classes)

## Usage Examples

### Recording Event Processing

```typescript
// Success
metricsService.incrementEventsProcessed('raffle_created', 'success', 1);

// Failure
metricsService.incrementEventsFailed('raffle_created', 1);
```

### Recording Database Operations

```typescript
const start = Date.now();
await database.query('SELECT * FROM raffles WHERE id = $1', [id]);
const duration = (Date.now() - start) / 1000;

metricsService.recordDatabaseLatency(duration, 'select');
metricsService.recordDatabaseQueryDuration(duration, 'select_raffle_by_id');

if (duration > 1.0) {
  metricsService.incrementSlowDbQuery('select_raffle_by_id');
}
```

### Recording Cache Operations

```typescript
const start = Date.now();
const value = await cache.get(key);
const duration = (Date.now() - start) / 1000;

if (value) {
  metricsService.incrementCacheHits('redis');
} else {
  metricsService.incrementCacheMisses('redis');
}

metricsService.recordCacheLatency(duration, 'get', 'redis');
```

### Recording Queue Metrics

```typescript
// On retry
metricsService.incrementRetries('raffle-events', 'raffle_created');

// On DLQ
metricsService.incrementDlqMessages('raffle-events');

// Update queue depth
metricsService.setQueueDepth('raffle-events', queueLength);
```

## Grafana Dashboards

Pre-configured Grafana dashboards are available in `indexer/grafana/`:
- `indexer-dashboard.json`: Comprehensive monitoring dashboard

Import these into Grafana to visualize all metrics.

## Prometheus Alerts

Alert rules are defined in `indexer/prometheus/alerts.rules.yml`:
- High lag detection
- High error rates
- DLQ accumulation
- Database performance issues
- Cache performance degradation
- Queue depth warnings

## Testing

Run the metrics service tests:

```bash
cd indexer && npm run test -- metrics.service.spec.ts
```

## Integration

The MetricsService is globally available throughout the application. Inject it into any service:

```typescript
constructor(private readonly metricsService: MetricsService) {}
```
