# Queue State Machine Quick Reference

## State Flow

```
queued → generating → submitting → confirming → confirmed ✓
   ↓         ↓            ↓            ↓
   └─────────┴────────────┴────────────→ retrying → generating (or dead-lettered)
```

## States

| State | Description | Action Required |
|-------|-------------|-----------------|
| `queued` | Waiting for processing slot | None - automatic |
| `generating` | Computing randomness | None - automatic |
| `submitting` | Sending transaction | None - automatic |
| `confirming` | Waiting for on-chain confirmation | None - automatic |
| `confirmed` | ✅ Success | None |
| `retrying` | In backoff before retry | None - automatic |
| `failed` | ❌ Non-retriable error | Review logs |
| `dead-lettered` | ⚠️ Max retries exhausted | **Manual rescue required** |

## Key Endpoints

```bash
# Health check
GET /queue/health

# Metrics
GET /queue/metrics

# Dead-lettered jobs (needs rescue)
GET /queue/dead-letter

# Jobs by state
GET /queue/jobs/retrying
GET /queue/jobs/confirming
GET /queue/jobs/failed
```

## Configuration

```bash
# .env defaults
QUEUE_MAX_RETRIES=5
QUEUE_INITIAL_BACKOFF_MS=2000
QUEUE_MAX_CONCURRENCY=10
QUEUE_CONFIRMATION_TIMEOUT_MS=30000
```

## Backoff Schedule

```
Attempt 1: 2s
Attempt 2: 4s
Attempt 3: 8s
Attempt 4: 16s
Attempt 5: 32s
Attempt 6+: 60s (max)
```

## Health Status

- **Healthy**: No dead-lettered jobs, < 5 failed, < 50 pending
- **Degraded**: > 5 failed OR > 50 pending
- **Unhealthy**: Any dead-lettered jobs

## Common Operations

### Check Queue Health
```bash
curl http://localhost:3000/queue/health
```

### View Dead-Lettered Jobs
```bash
curl http://localhost:3000/queue/dead-letter
```

### Rescue Dead-Lettered Job
```bash
npm run oracle:rescue -- --request-id <request-id>
```

### Monitor Metrics
```bash
watch -n 5 'curl -s http://localhost:3000/queue/metrics | jq'
```

## Retriable vs Non-Retriable Errors

### Retriable (Auto-Retry)
- Timeouts
- Network errors (ECONNREFUSED, 503, 502)
- Rate limiting (429)
- Insufficient fee

### Non-Retriable (Immediate Fail)
- Invalid/malformed requests
- Unauthorized (401, 403)
- Contract reverts
- Transaction failed on-chain

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
4. Use rescue CLI to reprocess

### Degraded Health
1. Check `/queue/health` for specifics
2. Review `/queue/jobs/failed` for patterns
3. Check logs for recurring errors
4. Address root cause

## Metrics Structure

```json
{
  "queuedCount": 5,
  "generatingCount": 2,
  "submittingCount": 1,
  "confirmingCount": 3,
  "retryingCount": 1,
  "confirmedCount": 150,
  "failedCount": 2,
  "deadLetteredCount": 0,
  "pendingCount": 12,
  "totalFailedCount": 2
}
```

## Testing

```bash
# Run state manager tests
npm run test -- job-state-manager.spec.ts

# Run processor tests
npm run test -- randomness-processor.service.spec.ts

# Run all queue tests
npm run test -- --testPathPattern=queue
```

## Key Files

- `job-state.types.ts` - State definitions and types
- `job-state-manager.ts` - State machine logic
- `randomness-processor.service.ts` - Processing phases
- `randomness.worker.ts` - Bull queue integration
- `queue-health.controller.ts` - Monitoring endpoints

## Logs to Watch

```
Job req-123 transitioned: generating → submitting [attempt 1/5]
Job req-456 transitioned: submitting → retrying (Insufficient fee) [attempt 2/5]
[DEAD-LETTER] Job 789 exhausted all 5 attempts. Manual intervention required.
```

## Quick Diagnostics

```bash
# Count by state
curl -s http://localhost:3000/queue/metrics | jq '{queued, generating, submitting, confirming, retrying, failed, deadLettered}'

# Active processing
curl -s http://localhost:3000/queue/config | jq '{activeProcessing, maxConcurrency}'

# Recent failures
curl -s http://localhost:3000/queue/jobs/failed | jq 'map({requestId, raffleId, lastError})'
```
