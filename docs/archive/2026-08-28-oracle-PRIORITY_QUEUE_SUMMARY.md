# Priority Queue Implementation Summary

## What Was Implemented

Added priority levels to the Bull queue system to ensure high-stakes raffles (flash raffles, large prizes) receive faster randomness reveals.

## Key Changes

### 1. Queue Types (`queue.types.ts`)
- Added `priority` field to `RandomnessRequest` interface
- Added `JobPriority` enum with 4 levels: CRITICAL (0), HIGH (1), NORMAL (5), LOW (10)

### 2. Randomness Worker (`randomness.worker.ts`)
- Added `determinePriority()` method for automatic priority assignment
- Added `trackHighPrioritySLA()` method for monitoring high-priority job performance
- Modified `handleRandomnessJob()` to track and log priority
- High-stakes threshold: 500 XLM
- SLA threshold: 5 seconds for high-priority jobs

### 3. Event Listener (`event-listener.service.ts`)
- Modified `handleRandomnessRequested()` to extract priority from contract events
- Converts prize amount from stroops to XLM
- Passes priority to Bull queue when adding jobs
- Supports optional `priority` flag from contract events

## Priority Rules

### Automatic Assignment
- **Prize ≥ 500 XLM** → HIGH priority (1)
- **Prize < 500 XLM** → NORMAL priority (5)
- **No prize amount** → NORMAL priority (5)

### Manual Override
Contract can include optional `priority` field in `RandomnessRequested` event:
```rust
events::randomness_requested(raffle_id, request_id, prize_amount, Some(0));
```

Priority flag takes precedence over automatic assignment.

## Processing Order

Jobs are processed in ascending order of priority value:
1. **CRITICAL** (0) - Emergency/manual override
2. **HIGH** (1) - High-stakes raffles
3. **NORMAL** (5) - Standard raffles
4. **LOW** (10) - Background tasks

## SLA Monitoring

High-priority jobs (HIGH and CRITICAL) are monitored:
- Start time recorded when processing begins
- Completion time logged
- Warning issued if processing exceeds 5 seconds

Example logs:
```
[SLA OK] High-priority job req_abc completed in 2341ms
[SLA BREACH] High-priority job req_xyz took 6782ms (threshold: 5000ms)
```

## Backward Compatibility

✅ **Fully backward compatible**
- Existing raffles work without changes
- No breaking changes to API or events
- Automatic priority assignment for all jobs
- Old events processed with NORMAL priority

## Testing

Created comprehensive unit tests in `randomness.worker.spec.ts`:
- Priority determination logic
- Edge cases (threshold boundaries, negative values)
- Contract flag override behavior
- All priority levels

## Documentation

Created 4 documentation files:

1. **PRIORITY_QUEUE_IMPLEMENTATION.md** - Complete implementation details
2. **PRIORITY_QUEUE_QUICK_REF.md** - Quick reference guide
3. **PRIORITY_QUEUE_MIGRATION.md** - Deployment and migration guide
4. **PRIORITY_QUEUE_SUMMARY.md** - This file

Updated **README.md** to mention priority queue feature.

## Configuration

### Tunable Constants

In `randomness.worker.ts`:
```typescript
HIGH_STAKES_THRESHOLD_XLM = 500;  // Prize threshold for HIGH priority
SLA_THRESHOLD_MS = 5000;          // 5 seconds for high-priority jobs
```

### No Environment Variables Required
Uses existing Bull queue and Redis configuration.

## Deployment

### Requirements
- Redis ≥3.2 (already required for Bull)
- No additional dependencies
- No database migrations

### Steps
1. Pull latest code
2. Run `npm install` (no new dependencies)
3. Run `npm run build`
4. Deploy updated service
5. Monitor logs for priority assignments

See [PRIORITY_QUEUE_MIGRATION.md](./PRIORITY_QUEUE_MIGRATION.md) for detailed steps.

## Monitoring

### Key Logs to Watch

1. **Priority Assignment**:
   ```
   [RandomnessRequested] raffle=X, request=Y, prize=Z XLM, priority=P
   ```

2. **Job Processing**:
   ```
   Processing randomness request job ID for raffle X, request Y, priority=P
   ```

3. **SLA Tracking**:
   ```
   [SLA OK] High-priority job Y completed in Xms
   [SLA BREACH] High-priority job Y took Xms (threshold: 5000ms)
   ```

### Metrics to Track
- Priority distribution (how many HIGH vs NORMAL jobs)
- Average processing time by priority
- SLA breach rate for high-priority jobs
- Queue depth by priority level

## Contract Integration (Optional)

To support manual priority override, update contract event:

```rust
// Add optional priority parameter
pub fn randomness_requested(
    env: &Env,
    raffle_id: u32,
    request_id: BytesN<32>,
    prize_amount: i128,
    priority: Option<u32>,  // New field
) {
    env.events().publish(
        (symbol_short!("randomness_requested"),),
        (raffle_id, request_id, prize_amount, priority),
    );
}
```

**Note**: This is optional. Oracle works without contract changes.

## Benefits

1. **Faster reveals for high-stakes raffles** - Processed before standard raffles
2. **Flash raffle support** - Manual CRITICAL priority for urgent reveals
3. **SLA monitoring** - Track and alert on high-priority job performance
4. **Flexible prioritization** - Both automatic and manual priority assignment
5. **No breaking changes** - Fully backward compatible

## Future Enhancements

Potential improvements:
1. Dynamic priority adjustment based on queue depth
2. Priority metrics dashboard
3. Configurable thresholds via environment variables
4. Priority-based rate limiting
5. Multi-tier SLA thresholds

## Files Modified

- `oracle/src/queue/queue.types.ts` - Added priority types
- `oracle/src/queue/randomness.worker.ts` - Priority logic and SLA tracking
- `oracle/src/listener/event-listener.service.ts` - Priority extraction and assignment
- `oracle/README.md` - Added priority queue section

## Files Created

- `oracle/src/queue/randomness.worker.spec.ts` - Unit tests
- `oracle/PRIORITY_QUEUE_IMPLEMENTATION.md` - Full documentation
- `oracle/PRIORITY_QUEUE_QUICK_REF.md` - Quick reference
- `oracle/PRIORITY_QUEUE_MIGRATION.md` - Migration guide
- `oracle/PRIORITY_QUEUE_SUMMARY.md` - This summary

## References

- [Bull Queue Priority Documentation](https://github.com/OptimalBits/bull/blob/develop/REFERENCE.md#queueadd)
- Bull Priority: Lower numbers = higher priority
- Related docs: `COMMIT_REVEAL.md`, `MULTI_ORACLE.md`

## Status

✅ **Implementation Complete**
- Code changes implemented
- Unit tests created
- Documentation written
- No TypeScript errors
- Backward compatible
- Ready for deployment
