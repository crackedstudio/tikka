# Metrics Quick Reference

Quick copy-paste snippets for common metric recording patterns.

## Event Processing

```typescript
// Success
this.metricsService.incrementEventsProcessed('raffle_created', 'success', 1);

// Failure
this.metricsService.incrementEventsFailed('raffle_created', 1);

// Error with type
this.metricsService.incrementErrors('parsing_error', 1);
```

## Database Operations

```typescript
const start = Date.now();
try {
  const result = await this.repository.find(...);
  const duration = (Date.now() - start) / 1000;
  
  this.metricsService.recordDatabaseQueryDuration(duration, 'select_raffles');
  this.metricsService.recordDatabaseLatency(duration, 'select');
  
  if (duration > 1.0) {
    this.metricsService.incrementSlowDbQuery('select_raffles');
  }
  
  return result;
} catch (error) {
  this.metricsService.incrementErrors('database_error', 1);
  throw error;
}
```

## Cache Operations

```typescript
const start = Date.now();
const value = await this.cache.get(key);
const duration = (Date.now() - start) / 1000;

if (value !== null) {
  this.metricsService.incrementCacheHits('redis');
} else {
  this.metricsService.incrementCacheMisses('redis');
}

this.metricsService.recordCacheLatency(duration, 'get', 'redis');
```

## Queue Processing

```typescript
try {
  await this.processJob(job);
  this.metricsService.incrementEventsProcessed(eventType, 'success', 1);
} catch (error) {
  if (job.attemptsMade > 0) {
    this.metricsService.incrementRetries('raffle-events', eventType);
  }
  
  if (job.attemptsMade >= job.opts.attempts) {
    this.metricsService.incrementDlqMessages('raffle-events');
  }
  
  this.metricsService.incrementEventsFailed(eventType);
  throw error;
}
```

## Lag Tracking

```typescript
const networkLedger = await this.getNetworkLedger();
const currentLedger = await this.getCurrentLedger();
const lag = networkLedger - currentLedger;

this.metricsService.setLagLedgers(lag);
```

## Reorg Detection

```typescript
this.metricsService.incrementReorgDetected(1);
```

## Poll Duration

```typescript
const start = Date.now();
await this.pollLedgers();
const duration = (Date.now() - start) / 1000;

this.metricsService.recordPollDuration(duration);
```

## Queue Depth

```typescript
const waiting = await queue.getWaitingCount();
const active = await queue.getActiveCount();
const depth = waiting + active;

this.metricsService.setQueueDepth('raffle-events', depth);
```

## Common Label Values

### Event Types
- `raffle_created`
- `raffle_ended`
- `ticket_purchased`
- `winner_selected`
- `user_registered`

### Outcomes
- `success`
- `partial`
- `skipped`

### Error Types
- `parsing_error`
- `network_error`
- `validation_error`
- `database_error`
- `cache_error`
- `processing_error`

### Operation Types (DB)
- `select`
- `insert`
- `update`
- `delete`

### Cache Types
- `redis`
- `memory`
- `default`

### Queue Names
- `raffle-events`
- `ticket-events`
- `user-events`
- `admin-events`

## Prometheus Queries

### Event Processing Rate
```promql
sum by (event_type) (rate(tikka_indexer_events_processed_total[5m]))
```

### Failure Rate
```promql
sum(rate(tikka_indexer_events_failed_total[5m])) / sum(rate(tikka_indexer_events_processed_total[5m]))
```

### Database P95 Latency
```promql
histogram_quantile(0.95, rate(tikka_db_latency_seconds_bucket[5m]))
```

### Cache Hit Rate
```promql
sum(rate(tikka_cache_hits_total[5m])) / (sum(rate(tikka_cache_hits_total[5m])) + sum(rate(tikka_cache_misses_total[5m])))
```

### Queue Backlog
```promql
tikka_queue_depth{queue_name="raffle-events"}
```

### DLQ Rate
```promql
sum by (queue_name) (rate(tikka_dlq_messages_total[5m]))
```
