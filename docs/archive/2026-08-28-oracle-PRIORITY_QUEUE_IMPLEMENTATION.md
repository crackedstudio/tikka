# Priority Queue Implementation

## Overview

This document describes the implementation of priority levels for the Bull queue in the Tikka Oracle service. The priority queue ensures that high-stakes raffles (flash raffles, large prize pools) receive faster randomness reveals.

## Features

### 1. Priority Levels

Four priority levels are defined in `queue.types.ts`:

```typescript
export enum JobPriority {
  LOW = 10,        // Low priority jobs
  NORMAL = 5,      // Standard raffles
  HIGH = 1,        // High-stakes raffles (>500 XLM)
  CRITICAL = 0,    // Emergency/manual priority
}
```

**Note**: In Bull queue, lower numbers = higher priority. Jobs are processed in ascending order of priority value.

### 2. Automatic Priority Assignment

Priority is automatically determined based on prize amount:

- **Prize ≥ 500 XLM**: `HIGH` priority (value: 1)
- **Prize < 500 XLM**: `NORMAL` priority (value: 5)
- **No prize amount**: `NORMAL` priority (value: 5)

The threshold of 500 XLM is configurable via the `HIGH_STAKES_THRESHOLD_XLM` constant in `randomness.worker.ts`.

### 3. Contract Event Priority Flag

The smart contract can optionally include a `priority` field in the `RandomnessRequested` event:

```rust
// In Stellar smart contract
events::randomness_requested(
    raffle_id,
    request_id,
    prize_amount,
    Some(0)  // Optional: Override with CRITICAL priority
);
```

When the `priority` flag is present in the contract event, it takes precedence over the automatic prize-based priority.

### 4. Queue Processing

The Bull queue worker processes jobs in priority order:

1. **CRITICAL** (priority: 0) - Processed first
2. **HIGH** (priority: 1) - High-stakes raffles
3. **NORMAL** (priority: 5) - Standard raffles
4. **LOW** (priority: 10) - Background tasks

### 5. SLA Monitoring

High-priority jobs (HIGH and CRITICAL) are monitored for SLA compliance:

- **SLA Threshold**: 5 seconds
- **Tracking**: Start time recorded when job begins processing
- **Alerts**: Warning logged if processing exceeds threshold

Example log output:

```
[SLA OK] High-priority job req_12345 completed in 2341ms
[SLA BREACH] High-priority job req_67890 took 6782ms (threshold: 5000ms)
```

## Implementation Details

### Modified Files

1. **`oracle/src/queue/queue.types.ts`**
   - Added `priority` field to `RandomnessRequest` interface
   - Added `JobPriority` enum

2. **`oracle/src/queue/randomness.worker.ts`**
   - Added `highPriorityJobStartTimes` map for SLA tracking
   - Modified `handleRandomnessJob()` to track priority and SLA
   - Added `determinePriority()` method for priority calculation
   - Added `trackHighPrioritySLA()` method for monitoring

3. **`oracle/src/listener/event-listener.service.ts`**
   - Modified `handleRandomnessRequested()` to extract priority fields
   - Converts prize amount from stroops to XLM
   - Passes priority to queue when adding jobs

### Priority Determination Logic

```typescript
determinePriority(prizeAmount?: number, priorityFlag?: number): number {
  // Contract event priority flag takes precedence
  if (priorityFlag !== undefined) {
    return priorityFlag;
  }

  // Prize-based priority
  if (!prizeAmount) {
    return JobPriority.NORMAL;
  }

  if (prizeAmount >= HIGH_STAKES_THRESHOLD_XLM) {
    return JobPriority.HIGH;
  }

  return JobPriority.NORMAL;
}
```

## Usage Examples

### Example 1: Automatic High Priority (Large Prize)

```typescript
// Contract emits event with 1000 XLM prize
// Event listener automatically assigns HIGH priority

[RandomnessRequested] raffle=42, request=req_abc, prize=1000 XLM, priority=1
Processing randomness request job 123 for raffle 42, request req_abc, priority=1
[SLA OK] High-priority job req_abc completed in 1823ms
```

### Example 2: Manual Critical Priority

```typescript
// Contract explicitly sets priority=0 for flash raffle
// Overrides automatic priority calculation

[RandomnessRequested] raffle=99, request=req_xyz, prize=100 XLM, priority=0
Processing randomness request job 456 for raffle 99, request req_xyz, priority=0
[SLA OK] High-priority job req_xyz completed in 987ms
```

### Example 3: Normal Priority (Standard Raffle)

```typescript
// Small prize raffle gets normal priority

[RandomnessRequested] raffle=15, request=req_def, prize=50 XLM, priority=5
Processing randomness request job 789 for raffle 15, request req_def, priority=5
```

## Configuration

### Environment Variables

No new environment variables are required. The implementation uses existing configuration.

### Tunable Constants

In `randomness.worker.ts`:

```typescript
private readonly HIGH_STAKES_THRESHOLD_XLM = 500;  // Prize threshold for HIGH priority
```

In `trackHighPrioritySLA()`:

```typescript
const SLA_THRESHOLD_MS = 5000;  // 5 seconds SLA for high-priority jobs
```

## Monitoring and Alerts

### Logs to Monitor

1. **Priority Assignment**:
   ```
   [RandomnessRequested] raffle=X, request=Y, prize=Z XLM, priority=P
   ```

2. **Job Processing**:
   ```
   Processing randomness request job ID for raffle X, request Y, priority=P
   ```

3. **SLA Compliance**:
   ```
   [SLA OK] High-priority job Y completed in Xms
   [SLA BREACH] High-priority job Y took Xms (threshold: 5000ms)
   ```

### Metrics to Track

- Number of high-priority jobs processed
- Average processing time for high-priority jobs
- SLA breach rate
- Queue depth by priority level

## Testing

### Manual Testing

1. **Test High-Stakes Priority**:
   ```bash
   # Create raffle with 1000 XLM prize
   # Verify HIGH priority assigned
   # Check logs for priority=1
   ```

2. **Test Normal Priority**:
   ```bash
   # Create raffle with 100 XLM prize
   # Verify NORMAL priority assigned
   # Check logs for priority=5
   ```

3. **Test Contract Priority Flag**:
   ```bash
   # Emit event with explicit priority=0
   # Verify CRITICAL priority used
   # Check logs for priority=0
   ```

### Unit Testing

Add tests in `randomness.worker.spec.ts`:

```typescript
describe('determinePriority', () => {
  it('should return HIGH for prizes >= 500 XLM', () => {
    expect(worker.determinePriority(500)).toBe(JobPriority.HIGH);
    expect(worker.determinePriority(1000)).toBe(JobPriority.HIGH);
  });

  it('should return NORMAL for prizes < 500 XLM', () => {
    expect(worker.determinePriority(100)).toBe(JobPriority.NORMAL);
  });

  it('should prioritize contract flag over prize amount', () => {
    expect(worker.determinePriority(100, 0)).toBe(0);
  });
});
```

## Deployment Checklist

- [ ] Review and adjust `HIGH_STAKES_THRESHOLD_XLM` if needed
- [ ] Review and adjust `SLA_THRESHOLD_MS` if needed
- [ ] Update smart contract to include optional `priority` field
- [ ] Deploy oracle service with priority queue support
- [ ] Monitor logs for priority assignments
- [ ] Set up alerts for SLA breaches
- [ ] Document priority levels for contract developers

## Future Enhancements

1. **Dynamic Priority Adjustment**: Adjust priority based on queue depth
2. **Priority Metrics Dashboard**: Visualize priority distribution and SLA compliance
3. **Configurable Thresholds**: Move constants to environment variables
4. **Priority-Based Rate Limiting**: Different rate limits per priority level
5. **Multi-Tier SLA**: Different SLA thresholds for different priority levels

## References

- [Bull Queue Priority Documentation](https://github.com/OptimalBits/bull/blob/develop/REFERENCE.md#queueadd)
- Bull Priority Range: 1 (highest) to MAX_INT (lowest)
- Related: `COMMIT_REVEAL.md`, `MULTI_ORACLE.md`
