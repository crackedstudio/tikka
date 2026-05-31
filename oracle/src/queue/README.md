# Queue Module - Robust Randomness Job Queue

## Overview

This module implements a robust, highly observable randomness job queue with explicit state machine lifecycle management, centralized configuration, and comprehensive telemetry.

## Architecture

### State Machine

```
queued → generating → submitting → confirming → confirmed ✓
   ↓         ↓            ↓            ↓
   └─────────┴────────────┴────────────→ retrying → (back to generating or dead-lettered)
```

### Components

- **JobStateManager**: Centralized state machine with transition validation
- **RandomnessProcessorService**: Core processing logic (generate, submit, confirm)
- **RandomnessWorker**: Bull queue integration with retry logic
- **QueueHealthController**: REST API for monitoring and telemetry

## Quick Start

### Import

```typescript
import {
  JobStateManager,
  RandomnessProcessorService,
  JobState,
  QueueMetrics,
} from './queue';
```

### Configuration

```bash
# .env
QUEUE_MAX_RETRIES=5
QUEUE_INITIAL_BACKOFF_MS=2000
QUEUE_MAX_CONCURRENCY=10
```

### Monitor Health

```bash
curl http://localhost:3000/queue/health
curl http://localhost:3000/queue/metrics
```

## Key Features

✅ **Explicit State Machine** - 8 states with validated transitions  
✅ **Automatic Retry** - Exponential backoff for retriable errors  
✅ **Dead-Letter Queue** - Manual rescue for exhausted jobs  
✅ **Concurrency Control** - Configurable processing limits  
✅ **Comprehensive Telemetry** - Real-time metrics and health status  
✅ **REST API** - Operator visibility and monitoring  
✅ **Full Test Coverage** - Unit tests for all failure scenarios  
✅ **Backward Compatible** - Works with existing Bull queue

## Files

### Core
- `job-state.types.ts` - State definitions and types
- `job-state-manager.ts` - State machine logic
- `randomness-processor.service.ts` - Processing phases
- `randomness.worker.ts` - Bull queue integration
- `queue-health.controller.ts` - Monitoring endpoints
- `queue.module.ts` - NestJS module

### Tests
- `job-state-manager.spec.ts` - State machine tests
- `randomness-processor.service.spec.ts` - Processing tests

### Legacy (Backward Compatibility)
- `queue.types.ts` - Original types
- `randomness.queue.ts` - Queue name constant
- `priority-classifier.service.ts` - Priority logic
- `commit-reveal.worker.ts` - Commit-reveal pattern

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /queue/metrics` | Comprehensive metrics by state |
| `GET /queue/health` | Health status (healthy/degraded/unhealthy) |
| `GET /queue/jobs/:state` | Jobs in specific state |
| `GET /queue/dead-letter` | Jobs requiring manual rescue |
| `GET /queue/config` | Current configuration |

## States

| State | Description | Terminal |
|-------|-------------|----------|
| `queued` | Waiting for processing slot | No |
| `generating` | Computing randomness | No |
| `submitting` | Sending transaction | No |
| `confirming` | Waiting for confirmation | No |
| `confirmed` | ✅ Success | Yes |
| `retrying` | In backoff before retry | No |
| `failed` | ❌ Non-retriable error | Yes |
| `dead-lettered` | ⚠️ Max retries exhausted | Yes |

## Usage Examples

### Check Queue Health

```typescript
import { JobStateManager } from './queue';

const metrics = stateManager.getMetrics();
console.log(`Pending: ${metrics.pendingCount}`);
console.log(`Failed: ${metrics.totalFailedCount}`);
```

### Process a Request

```typescript
import { RandomnessProcessorService } from './queue';

const result = await processor.processRequest({
  requestId: 'req-123',
  raffleId: 456,
  prizeAmount: 1000,
});

if (result.success) {
  console.log(`Success: ${result.txHash}`);
} else if (result.shouldRetry) {
  console.log(`Will retry: ${result.error}`);
} else {
  console.log(`Failed permanently: ${result.error}`);
}
```

### Monitor via API

```bash
# Health check
curl http://localhost:3000/queue/health

# Metrics
curl http://localhost:3000/queue/metrics

# Dead-lettered jobs
curl http://localhost:3000/queue/dead-letter
```

## Testing

```bash
# Run all queue tests
npm run test -- --testPathPattern=queue

# Run specific test file
npm run test -- job-state-manager.spec.ts
npm run test -- randomness-processor.service.spec.ts
```

## Configuration

All parameters are optional with sensible defaults:

```typescript
interface QueueConfig {
  maxRetries: number;              // Default: 5
  initialBackoffMs: number;        // Default: 2000
  backoffMultiplier: number;       // Default: 2
  maxBackoffMs: number;            // Default: 60000
  confirmationTimeoutMs: number;   // Default: 30000
  maxConcurrency: number;          // Default: 10
  generationTimeoutMs: number;     // Default: 15000
  submissionTimeoutMs: number;     // Default: 45000
}
```

## Error Handling

### Retriable Errors (Auto-Retry)
- Timeouts
- Network errors (ECONNREFUSED, 503, 502)
- Rate limiting (429)
- Insufficient fee

### Non-Retriable Errors (Immediate Fail)
- Invalid/malformed requests
- Unauthorized (401, 403)
- Contract reverts
- Transaction failed on-chain

## Telemetry

### Metrics Structure

```typescript
interface QueueMetrics {
  queuedCount: number;
  generatingCount: number;
  submittingCount: number;
  confirmingCount: number;
  retryingCount: number;
  confirmedCount: number;
  failedCount: number;
  deadLetteredCount: number;
  pendingCount: number;        // Sum of active states
  totalFailedCount: number;    // failed + dead-lettered
}
```

### Health Status

```typescript
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  pendingCount: number;
  failedCount: number;
  deadLetteredCount: number;
  activeProcessing: number;
  maxConcurrency: number;
  timestamp: string;
}
```

## Troubleshooting

### High Pending Count
1. Check `/queue/metrics` for state distribution
2. If many in `confirming`: Check RPC health
3. If many in `retrying`: Review error logs
4. Consider increasing `QUEUE_MAX_CONCURRENCY`

### Dead-Lettered Jobs
1. Check `/queue/dead-letter` for details
2. Review `lastError` field
3. Fix root cause (RPC, fees, etc.)
4. Use rescue CLI: `npm run oracle:rescue -- --request-id <id>`

### Degraded Health
1. Check `/queue/health` for specifics
2. Review `/queue/jobs/failed` for patterns
3. Check logs for recurring errors
4. Address root cause

## Documentation

- [Full Implementation Guide](../../QUEUE_STATE_MACHINE_IMPLEMENTATION.md)
- [Quick Reference](../../QUEUE_STATE_MACHINE_QUICK_REF.md)
- [Summary](../../QUEUE_STATE_MACHINE_SUMMARY.md)

## License

Part of the Tikka Oracle service.
