# Priority Queue Migration Guide

## Overview

This guide helps you migrate an existing Tikka Oracle deployment to support priority queue processing.

## Prerequisites

- Existing oracle deployment running
- Access to oracle configuration
- Redis instance (already required for Bull queue)
- Smart contract deployment access (optional, for priority flag support)

## Migration Steps

### Step 1: Update Oracle Service

#### 1.1 Pull Latest Code

```bash
cd oracle
git pull origin master
```

#### 1.2 Install Dependencies

```bash
npm install
# or
pnpm install
```

#### 1.3 Build the Service

```bash
npm run build
```

### Step 2: Configuration Review

#### 2.1 Review Priority Thresholds

Check `src/queue/randomness.worker.ts`:

```typescript
private readonly HIGH_STAKES_THRESHOLD_XLM = 500;  // Adjust if needed
```

**Recommendation**: Keep default (500 XLM) unless you have specific requirements.

#### 2.2 Review SLA Threshold

Check `trackHighPrioritySLA()` method:

```typescript
const SLA_THRESHOLD_MS = 5000;  // 5 seconds
```

**Recommendation**: Keep default (5s) for initial deployment, adjust based on monitoring.

### Step 3: Deploy Updated Service

#### 3.1 Zero-Downtime Deployment (Recommended)

```bash
# Deploy new version alongside old version
kubectl apply -f k8s/deployment.yaml

# Monitor new pods
kubectl get pods -w

# Verify new pods are healthy
kubectl logs -f <new-pod-name>

# Scale down old version
kubectl scale deployment oracle --replicas=0
```

#### 3.2 Simple Deployment

```bash
# Stop current service
kubectl delete deployment oracle

# Deploy new version
kubectl apply -f k8s/deployment.yaml

# Verify deployment
kubectl get pods
kubectl logs -f <pod-name>
```

### Step 4: Verify Priority Queue

#### 4.1 Check Logs

Look for priority assignments in logs:

```bash
kubectl logs -f <pod-name> | grep "priority="
```

Expected output:
```
[RandomnessRequested] raffle=X, request=Y, prize=Z XLM, priority=P
Processing randomness request job ID for raffle X, request Y, priority=P
```

#### 4.2 Test with Sample Raffle

Create test raffles with different prize amounts:

```bash
# High-stakes raffle (should get HIGH priority)
# Create raffle with 1000 XLM prize
# Check logs for priority=1

# Standard raffle (should get NORMAL priority)
# Create raffle with 100 XLM prize
# Check logs for priority=5
```

### Step 5: Smart Contract Update (Optional)

If you want to support manual priority override:

#### 5.1 Update Contract Event

Add optional `priority` field to `RandomnessRequested` event:

```rust
// Before
pub fn randomness_requested(
    env: &Env,
    raffle_id: u32,
    request_id: BytesN<32>,
    prize_amount: i128,
) {
    env.events().publish(
        (symbol_short!("randomness_requested"),),
        (raffle_id, request_id, prize_amount),
    );
}

// After
pub fn randomness_requested(
    env: &Env,
    raffle_id: u32,
    request_id: BytesN<32>,
    prize_amount: i128,
    priority: Option<u32>,
) {
    env.events().publish(
        (symbol_short!("randomness_requested"),),
        (raffle_id, request_id, prize_amount, priority),
    );
}
```

#### 5.2 Deploy Updated Contract

```bash
# Build contract
cd contract
cargo build --release --target wasm32-unknown-unknown

# Deploy to testnet first
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/raffle.wasm \
  --network testnet

# Test priority override
# Verify oracle logs show custom priority

# Deploy to mainnet
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/raffle.wasm \
  --network mainnet
```

## Backward Compatibility

✅ **Fully backward compatible**

- Existing raffles without priority field work normally
- Automatic priority assignment based on prize amount
- No breaking changes to existing functionality
- Old events are processed with NORMAL priority

## Rollback Plan

If issues occur, rollback is straightforward:

### Option 1: Rollback Code

```bash
# Revert to previous version
git checkout <previous-commit>
npm run build
kubectl apply -f k8s/deployment.yaml
```

### Option 2: Keep New Code, Disable Priority

The priority queue is always active, but you can:

1. Set all priorities to NORMAL in contract
2. Monitor logs to ensure no issues
3. Gradually re-enable priority levels

## Monitoring After Migration

### Key Metrics to Watch

1. **Priority Distribution**
   ```bash
   kubectl logs <pod-name> | grep "priority=" | awk -F'priority=' '{print $2}' | sort | uniq -c
   ```

2. **SLA Compliance**
   ```bash
   kubectl logs <pod-name> | grep "SLA"
   ```

3. **Queue Depth**
   ```bash
   # Check Redis queue depth
   redis-cli -h <redis-host> llen bull:randomness-queue:wait
   ```

4. **Processing Times**
   ```bash
   kubectl logs <pod-name> | grep "completed in"
   ```

### Alert Thresholds

Set up alerts for:

- **SLA breaches**: >5% of high-priority jobs exceed 5s
- **Queue depth**: >100 pending jobs
- **Processing failures**: >1% failure rate
- **Priority distribution**: Unexpected priority patterns

## Testing Checklist

- [ ] Oracle service starts successfully
- [ ] Logs show priority assignments
- [ ] High-stakes raffles get HIGH priority (≥500 XLM)
- [ ] Standard raffles get NORMAL priority (<500 XLM)
- [ ] SLA monitoring logs appear for high-priority jobs
- [ ] Jobs process in priority order
- [ ] No errors in logs
- [ ] Existing raffles continue to work
- [ ] Contract priority flag works (if implemented)
- [ ] Rollback plan tested

## Common Issues

### Issue: Priority Not Applied

**Symptoms**: All jobs have same priority

**Solutions**:
1. Check Bull queue configuration supports priority
2. Verify Redis version (≥3.2 required)
3. Check event listener logs for priority assignment

### Issue: SLA Breaches

**Symptoms**: Many high-priority jobs exceed 5s

**Solutions**:
1. Increase worker concurrency
2. Optimize VRF computation
3. Check Stellar network latency
4. Consider increasing SLA threshold

### Issue: Jobs Stuck in Queue

**Symptoms**: Queue depth increasing, jobs not processing

**Solutions**:
1. Check worker is running
2. Verify Redis connection
3. Check for errors in worker logs
4. Restart worker if needed

## Performance Tuning

### Worker Concurrency

Adjust in `queue.module.ts`:

```typescript
BullModule.registerQueue({
  name: RANDOMNESS_QUEUE,
  processors: [
    {
      name: 'randomness',
      concurrency: 5,  // Increase for higher throughput
      path: './randomness.worker.ts',
    },
  ],
  // ...
}),
```

### Redis Configuration

For high-throughput deployments:

```yaml
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
```

## Support

If you encounter issues:

1. Check logs: `kubectl logs -f <pod-name>`
2. Review documentation: `PRIORITY_QUEUE_IMPLEMENTATION.md`
3. Check Bull queue status in Redis
4. Review recent commits for changes

## Next Steps

After successful migration:

1. Monitor for 24-48 hours
2. Adjust thresholds based on metrics
3. Consider implementing contract priority flag
4. Set up automated alerts
5. Document any custom configurations

## Related Documentation

- Implementation details: `PRIORITY_QUEUE_IMPLEMENTATION.md`
- Quick reference: `PRIORITY_QUEUE_QUICK_REF.md`
- Deployment guide: `README.md`
- Troubleshooting: `ON_CALL_TROUBLESHOOTING.md`
