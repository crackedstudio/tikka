# Metrics Integration Migration Guide

This guide helps you integrate the new comprehensive metrics into existing indexer code.

## Overview

The updated `MetricsService` now tracks:
- ✅ Event processing with outcomes
- ✅ Event failures by type
- ✅ Errors by error type
- ✅ Lag and reorgs
- ✅ Database latency and slow queries
- ✅ Cache hits/misses and latency
- ✅ Queue depth, DLQ messages, and retries

## Step-by-Step Integration

### 1. Update Event Processors

**Before:**
```typescript
this.metricsService.incrementEventsProcessed('raffle_created', 1);
```

**After:**
```typescript
// On success
this.metricsService.incrementEventsProcessed('raffle_created', 'success', 1);

// On failure
this.metricsService.incrementEventsFailed('raffle_created', 1);
```

**Files to update:**
- `indexer/src/processors/raffle.processor.ts`
- `indexer/src/processors/ticket.processor.ts`
- `indexer/src/processors/user.processor.ts`
- `indexer/src/processors/admin.processor.ts`

### 2. Update Error Handling

**Before:**
```typescript
this.metricsService.incrementErrors(1);
```

**After:**
```typescript
// Categorize errors
this.metricsService.incrementErrors('parsing_error', 1);
this.metricsService.incrementErrors('network_error', 1);
this.metricsService.incrementErrors('validation_error', 1);
this.metricsService.incrementErrors('database_error', 1);
```

**Error Type Categories:**
- `parsing_error` - Failed to parse event data
- `network_error` - Network/API failures
- `validation_error` - Data validation failures
- `database_error` - Database operation failures
- `cache_error` - Cache operation failures
- `processing_error` - General processing errors

### 3. Add Database Metrics

**Add to all database operations:**

```typescript
async findSomething(id: string) {
  const operation = 'select_something_by_id';
  const start = Date.now();
  
  try {
    const result = await this.repository.findOne({ where: { id } });
    
    const duration = (Date.now() - start) / 1000;
    this.metricsService.recordDatabaseQueryDuration(duration, operation);
    this.metricsService.recordDatabaseLatency(duration, 'select');
    
    if (duration > 1.0) {
      this.metricsService.incrementSlowDbQuery(operation);
    }
    
    return result;
  } catch (error) {
    this.metricsService.incrementErrors('database_error', 1);
    throw error;
  }
}
```

**Operation Types:**
- `select` - SELECT queries
- `insert` - INSERT operations
- `update` - UPDATE operations
- `delete` - DELETE operations

**Files to update:**
- All repository files in `indexer/src/database/`
- Any service files with direct database access

### 4. Add Cache Metrics

**Update cache service:**

```typescript
async get(key: string) {
  const start = Date.now();
  const cacheType = 'redis'; // or 'memory'
  
  try {
    const value = await this.redis.get(key);
    const duration = (Date.now() - start) / 1000;
    
    if (value !== null) {
      this.metricsService.incrementCacheHits(cacheType);
    } else {
      this.metricsService.incrementCacheMisses(cacheType);
    }
    
    this.metricsService.recordCacheLatency(duration, 'get', cacheType);
    return value;
  } catch (error) {
    this.metricsService.incrementErrors('cache_error', 1);
    throw error;
  }
}
```

**Files to update:**
- `indexer/src/cache/cache.service.ts`

### 5. Add Queue Metrics

**Update queue processors:**

```typescript
async process(job: Job) {
  const queueName = 'raffle-events';
  const eventType = job.data.type;
  
  try {
    await this.handleJob(job);
    this.metricsService.incrementEventsProcessed(eventType, 'success', 1);
  } catch (error) {
    // Track retries
    if (job.attemptsMade > 0) {
      this.metricsService.incrementRetries(queueName, eventType);
    }
    
    // Track DLQ
    if (job.attemptsMade >= job.opts.attempts) {
      this.metricsService.incrementDlqMessages(queueName);
    }
    
    this.metricsService.incrementEventsFailed(eventType);
    throw error;
  }
}
```

**Add queue depth monitoring:**

```typescript
// In a periodic task or health check
async updateQueueMetrics() {
  const queues = ['raffle-events', 'ticket-events', 'user-events'];
  
  for (const queueName of queues) {
    const queue = this.getQueue(queueName);
    const waiting = await queue.getWaitingCount();
    const active = await queue.getActiveCount();
    const depth = waiting + active;
    
    this.metricsService.setQueueDepth(queueName, depth);
  }
}
```

**Files to update:**
- `indexer/src/processors/raffle.processor.ts`
- `indexer/src/processors/ticket.processor.ts`
- `indexer/src/processors/user.processor.ts`

### 6. Update Database Query Labels

**Before:**
```typescript
this.metricsService.recordDatabaseQueryDuration(duration, 'abc123hash');
this.metricsService.incrementSlowDbQuery('abc123hash');
```

**After:**
```typescript
// Use descriptive operation names, NOT query hashes
this.metricsService.recordDatabaseQueryDuration(duration, 'select_raffles');
this.metricsService.incrementSlowDbQuery('select_raffles');
```

**⚠️ Important:** Never use high-cardinality values like query hashes, transaction IDs, or user IDs as labels.

## Testing Your Integration

### 1. Check Metrics Endpoint

```bash
curl http://localhost:3000/metrics
```

Look for the new metrics:
- `tikka_indexer_events_processed_total{event_type="...",outcome="..."}`
- `tikka_indexer_events_failed_total{event_type="..."}`
- `tikka_db_latency_seconds_bucket{operation_type="..."}`
- `tikka_cache_hits_total{cache_type="..."}`
- `tikka_dlq_messages_total{queue_name="..."}`
- `tikka_retries_total{queue_name="...",event_type="..."}`

### 2. Run Unit Tests

```bash
cd indexer
npm run test -- metrics.service.spec.ts
```

### 3. Verify in Grafana

1. Import the updated dashboard: `indexer/grafana/indexer-dashboard.json`
2. Check that all panels display data
3. Verify labels are showing correctly

### 4. Test Alerts

```bash
# Check alert rules syntax
promtool check rules indexer/prometheus/alerts.rules.yml
```

## Common Patterns

### Pattern 1: Wrap Database Calls

```typescript
private async withMetrics<T>(
  operation: string,
  operationType: 'select' | 'insert' | 'update' | 'delete',
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = (Date.now() - start) / 1000;
    
    this.metricsService.recordDatabaseQueryDuration(duration, operation);
    this.metricsService.recordDatabaseLatency(duration, operationType);
    
    if (duration > 1.0) {
      this.metricsService.incrementSlowDbQuery(operation);
    }
    
    return result;
  } catch (error) {
    this.metricsService.incrementErrors('database_error', 1);
    throw error;
  }
}

// Usage
const raffle = await this.withMetrics(
  'select_raffle_by_id',
  'select',
  () => this.repository.findOne({ where: { id } })
);
```

### Pattern 2: Decorator for Cache Operations

```typescript
function WithCacheMetrics(cacheType: string = 'redis') {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const start = Date.now();
      const metricsService = this.metricsService;
      
      try {
        const result = await originalMethod.apply(this, args);
        const duration = (Date.now() - start) / 1000;
        
        if (result !== null) {
          metricsService.incrementCacheHits(cacheType);
        } else {
          metricsService.incrementCacheMisses(cacheType);
        }
        
        metricsService.recordCacheLatency(duration, propertyKey, cacheType);
        return result;
      } catch (error) {
        metricsService.incrementErrors('cache_error', 1);
        throw error;
      }
    };
    
    return descriptor;
  };
}

// Usage
@WithCacheMetrics('redis')
async get(key: string) {
  return this.redis.get(key);
}
```

## Checklist

- [ ] Updated all event processors with outcome labels
- [ ] Added error type categorization
- [ ] Instrumented database operations with latency tracking
- [ ] Added cache hit/miss tracking
- [ ] Implemented queue depth monitoring
- [ ] Added DLQ and retry tracking
- [ ] Removed high-cardinality labels (hashes, IDs)
- [ ] Tested metrics endpoint
- [ ] Imported updated Grafana dashboard
- [ ] Verified Prometheus alerts
- [ ] Updated documentation

## Rollout Strategy

1. **Phase 1**: Add metrics to new code (no changes to existing)
2. **Phase 2**: Update one processor at a time
3. **Phase 3**: Update database and cache layers
4. **Phase 4**: Add queue monitoring
5. **Phase 5**: Deploy and verify in staging
6. **Phase 6**: Deploy to production

## Support

For questions or issues:
- Check `indexer/src/metrics/README.md`
- Review `indexer/src/metrics/metrics.integration.example.ts`
- See existing tests in `indexer/src/metrics/metrics.service.spec.ts`
