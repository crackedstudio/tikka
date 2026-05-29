# Priority Queue Quick Reference

## Priority Levels

| Priority | Value | Use Case | Processing Order |
|----------|-------|----------|------------------|
| CRITICAL | 0 | Emergency/Manual override | 1st (Highest) |
| HIGH | 1 | High-stakes raffles (≥500 XLM) | 2nd |
| NORMAL | 5 | Standard raffles (<500 XLM) | 3rd |
| LOW | 10 | Background tasks | 4th (Lowest) |

## Automatic Priority Rules

```
Prize Amount ≥ 500 XLM  → HIGH priority (1)
Prize Amount < 500 XLM  → NORMAL priority (5)
No prize amount         → NORMAL priority (5)
Contract priority flag  → Overrides automatic priority
```

## Contract Integration

### Option 1: Automatic (Prize-Based)

```rust
// Contract emits standard event
// Oracle automatically assigns priority based on prize
events::randomness_requested(raffle_id, request_id, prize_amount, None);
```

### Option 2: Manual Priority Override

```rust
// Contract explicitly sets priority
events::randomness_requested(
    raffle_id, 
    request_id, 
    prize_amount, 
    Some(0)  // CRITICAL priority
);
```

## SLA Monitoring

- **High-priority jobs** (HIGH and CRITICAL) are monitored
- **SLA threshold**: 5 seconds
- **Breach logging**: Automatic warning if exceeded

## Log Examples

### Normal Processing
```
[RandomnessRequested] raffle=42, request=req_abc, prize=1000 XLM, priority=1
Processing randomness request job 123 for raffle 42, request req_abc, priority=1
[SLA OK] High-priority job req_abc completed in 2341ms
```

### SLA Breach
```
[SLA BREACH] High-priority job req_xyz took 6782ms (threshold: 5000ms)
```

## Configuration

### Thresholds (in `randomness.worker.ts`)

```typescript
HIGH_STAKES_THRESHOLD_XLM = 500;  // Prize threshold for HIGH priority
SLA_THRESHOLD_MS = 5000;          // 5 seconds for high-priority jobs
```

## Testing Commands

```bash
# Run priority tests
npm test -- randomness.worker.spec.ts

# Check for TypeScript errors
npm run lint

# Build the project
npm run build
```

## Monitoring Queries

### Check Priority Distribution
```bash
# Search logs for priority assignments
grep "priority=" oracle.log | awk -F'priority=' '{print $2}' | sort | uniq -c
```

### Check SLA Breaches
```bash
# Find SLA breaches
grep "SLA BREACH" oracle.log
```

### Average Processing Time
```bash
# Extract processing times for high-priority jobs
grep "SLA OK" oracle.log | grep -oP '\d+ms' | sed 's/ms//' | awk '{sum+=$1; count++} END {print sum/count "ms"}'
```

## Common Scenarios

### Flash Raffle (Urgent)
- **Prize**: Any amount
- **Priority**: CRITICAL (0) via contract flag
- **Expected**: Processed immediately, <5s SLA

### High-Stakes Raffle
- **Prize**: ≥500 XLM
- **Priority**: HIGH (1) automatic
- **Expected**: Processed before normal raffles, <5s SLA

### Standard Raffle
- **Prize**: <500 XLM
- **Priority**: NORMAL (5) automatic
- **Expected**: Standard processing order

## Troubleshooting

### Jobs Not Processing in Priority Order
1. Check Redis connection
2. Verify Bull queue configuration
3. Check worker concurrency settings

### SLA Breaches
1. Check system load
2. Review VRF computation time
3. Check Stellar network latency
4. Consider increasing worker concurrency

### Priority Not Applied
1. Verify contract event includes prize_amount or priority field
2. Check event listener logs for priority assignment
3. Verify Bull queue accepts priority option

## Related Documentation

- Full implementation: `PRIORITY_QUEUE_IMPLEMENTATION.md`
- Commit/Reveal flow: `COMMIT_REVEAL.md`
- Multi-oracle setup: `MULTI_ORACLE.md`
- Bull queue docs: https://github.com/OptimalBits/bull
