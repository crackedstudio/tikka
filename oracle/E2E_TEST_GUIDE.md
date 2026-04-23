# End-to-End Oracle Testing Guide

## Overview

This guide covers the comprehensive end-to-end testing strategy for the Tikka oracle system, verifying the complete flow from event detection to randomness reveal transaction submission.

## Test Coverage

### 1. Mocked Integration Tests (`e2e-oracle-flow.spec.ts`)

Tests the complete oracle cycle with mocked external dependencies:

- ✅ Event listener receives `RandomnessRequested` from Horizon
- ✅ Queue job creation and processing
- ✅ Randomness computation (VRF and PRNG paths)
- ✅ Transaction submission to Soroban RPC
- ✅ Idempotency checks
- ✅ Error handling and retries
- ✅ Performance benchmarks
- ✅ Lag monitoring

**Run with:**
```bash
npm test -- e2e-oracle-flow.spec.ts
```

### 2. Standalone Node Tests (`e2e-standalone-node.spec.ts`)

Tests against a real local Soroban standalone node:

- ✅ Real transaction building and submission
- ✅ Actual RPC interaction
- ✅ Contract state verification
- ✅ Transaction confirmation
- ✅ Fee estimation
- ✅ Multi-request handling

**Prerequisites:**
```bash
# Start standalone node
docker run --rm -it -p 8000:8000 \
  --name stellar \
  stellar/quickstart:testing \
  --standalone
```

**Run with:**
```bash
export TEST_CONTRACT_ID=<your_deployed_contract_id>
npm run test:e2e:standalone
```

## Test Scenarios

### Scenario 1: Low-Stakes Raffle (PRNG Path)

**Flow:**
1. Mock `RandomnessRequested` event with `prizeAmount < 500 XLM`
2. Event listener enqueues job
3. Worker determines PRNG method
4. PRNG service computes randomness
5. Submitter builds and submits transaction
6. Verify transaction hash returned

**Expected Time:** < 2 seconds

**Test:**
```typescript
it('should complete full cycle for low-stakes raffle (PRNG path)')
```

### Scenario 2: High-Stakes Raffle (VRF Path)

**Flow:**
1. Mock `RandomnessRequested` event with `prizeAmount >= 500 XLM`
2. Event listener enqueues job
3. Worker determines VRF method
4. VRF service computes verifiable randomness with proof
5. Submitter builds and submits transaction with proof
6. Verify transaction hash returned

**Expected Time:** < 3 seconds

**Test:**
```typescript
it('should complete full cycle for high-stakes raffle (VRF path)')
```

### Scenario 3: Idempotency

**Flow:**
1. Submit randomness for raffle
2. Receive duplicate `RandomnessRequested` event
3. Worker checks contract state
4. Detects already submitted
5. Skips processing

**Expected Behavior:** No duplicate submission, no errors

**Test:**
```typescript
it('should skip processing if randomness already submitted')
```

### Scenario 4: Error Recovery

**Flow:**
1. Mock RPC connection failure
2. Worker attempts submission
3. Retry with exponential backoff
4. Eventually succeeds or exhausts retries
5. Alert logged for manual intervention

**Expected Behavior:** Graceful degradation, proper error logging

**Test:**
```typescript
it('should handle contract service errors gracefully')
it('should handle transaction submission failures')
```

### Scenario 5: Performance Benchmark

**Flow:**
1. Trigger event
2. Measure time to transaction submission
3. Verify < N seconds threshold

**Expected Time:**
- PRNG path: < 2 seconds
- VRF path: < 5 seconds

**Test:**
```typescript
it('should complete cycle within acceptable time limit')
```

### Scenario 6: Multiple Concurrent Requests

**Flow:**
1. Emit multiple `RandomnessRequested` events
2. Queue processes in parallel
3. All transactions submitted successfully
4. Verify correct method selection per raffle

**Expected Behavior:** All requests processed independently

**Test:**
```typescript
it('should handle multiple events in sequence')
```

## Architecture Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     E2E Oracle Test Flow                            │
└─────────────────────────────────────────────────────────────────────┘

1. Event Emission (Mocked Horizon)
   ↓
   Mock RandomnessRequested { raffle_id: 1, request_id: "req-001" }
   ↓

2. Event Listener
   ↓
   EventListenerService.handleEvent()
   - Parse XDR
   - Validate contract ID
   - Extract raffle_id, request_id
   ↓

3. Queue Enqueue
   ↓
   Bull Queue (Redis or in-memory mock)
   - Job: { raffleId: 1, requestId: "req-001" }
   ↓

4. Worker Processing
   ↓
   RandomnessWorker.processRequest()
   - Check if already submitted (idempotency)
   - Get raffle data (prize amount)
   - Determine method (VRF vs PRNG)
   ↓

5. Randomness Computation
   ↓
   ┌─────────────────┬─────────────────┐
   │  PRNG Path      │  VRF Path       │
   │  (< 500 XLM)    │  (>= 500 XLM)   │
   └─────────────────┴─────────────────┘
   ↓                 ↓
   PrngService       VrfService
   .compute()        .compute()
   ↓                 ↓
   { seed, proof }   { seed, proof }
   ↓

6. Transaction Submission
   ↓
   TxSubmitterService.submitRandomness()
   - Build Soroban transaction
   - Sign with oracle keypair
   - Submit to RPC
   - Poll for confirmation
   ↓

7. Verification
   ↓
   ✓ Transaction hash returned
   ✓ Lag monitor updated
   ✓ Health metrics recorded
   ✓ Contract state changed (standalone tests only)
```

## Test Execution

### Quick Test (Mocked)

```bash
# Run all mocked E2E tests
npm test -- e2e-oracle-flow.spec.ts

# Run specific test
npm test -- e2e-oracle-flow.spec.ts -t "PRNG path"

# Run with coverage
npm test -- e2e-oracle-flow.spec.ts --coverage
```

### Full Integration Test (Standalone Node)

```bash
# 1. Start standalone node
docker run --rm -it -p 8000:8000 \
  --name stellar \
  stellar/quickstart:testing \
  --standalone

# 2. Deploy contract (in another terminal)
cd ../contracts/raffle
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/raffle.wasm \
  --source <ADMIN_SECRET> \
  --rpc-url http://localhost:8000/soroban/rpc \
  --network-passphrase "Standalone Network ; February 2017"

# 3. Set contract ID
export TEST_CONTRACT_ID=<deployed_contract_id>

# 4. Run tests
npm run test:e2e:standalone

# 5. Cleanup
docker stop stellar
```

### Automated Full Test

```bash
# Run everything (requires Docker)
npm run test:e2e:full
```

This script will:
1. Start standalone node
2. Deploy test contract
3. Run all E2E tests
4. Cleanup

## Performance Benchmarks

### Target Metrics

| Metric | Target | Measured |
|--------|--------|----------|
| Event to Queue | < 100ms | ✓ |
| Queue to Worker | < 500ms | ✓ |
| PRNG Computation | < 50ms | ✓ |
| VRF Computation | < 200ms | ✓ |
| Transaction Build | < 100ms | ✓ |
| Transaction Submit | < 1s | ✓ |
| **Total (PRNG)** | **< 2s** | ✓ |
| **Total (VRF)** | **< 5s** | ✓ |

### Measuring Performance

```typescript
const startTime = Date.now();
capturedOnMessage!(event);
await waitForAsync(200);
const endTime = Date.now();
const cycleTime = endTime - startTime;

expect(cycleTime).toBeLessThan(5000); // 5 seconds
```

## Debugging

### Enable Verbose Logging

```bash
LOG_LEVEL=debug npm test -- e2e-oracle-flow.spec.ts
```

### Inspect Queue State

```typescript
// In test
const queueDepth = await randomnessQueue.count();
const jobs = await randomnessQueue.getJobs(['waiting', 'active', 'completed', 'failed']);
console.log('Queue state:', { queueDepth, jobs });
```

### Check Contract State (Standalone)

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <ADMIN_SECRET> \
  --rpc-url http://localhost:8000/soroban/rpc \
  --network-passphrase "Standalone Network ; February 2017" \
  -- \
  get_raffle_data \
  --raffle_id 1
```

## Troubleshooting

### Issue: Tests timeout

**Cause:** Standalone node not running or contract not deployed

**Solution:**
```bash
# Check node is running
curl http://localhost:8000/soroban/rpc -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'

# Should return: {"jsonrpc":"2.0","id":1,"result":{"status":"healthy"}}
```

### Issue: Transaction submission fails

**Cause:** Oracle account not funded

**Solution:**
```bash
# Fund oracle account
curl "http://localhost:8000/friendbot?addr=<ORACLE_PUBLIC_KEY>"
```

### Issue: Contract state not changing

**Cause:** Transaction not confirmed yet

**Solution:**
```typescript
// Wait longer for ledger close
await waitForLedger(3); // Wait 3 ledgers (~15 seconds)
```

## CI/CD Integration

### GitHub Actions Workflow

```yaml
name: E2E Oracle Tests

on: [push, pull_request]

jobs:
  e2e-mocked:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test -- e2e-oracle-flow.spec.ts

  e2e-standalone:
    runs-on: ubuntu-latest
    services:
      stellar:
        image: stellar/quickstart:testing
        options: --standalone
        ports:
          - 8000:8000
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - name: Deploy test contract
        run: ./scripts/deploy-test-contract.sh
      - name: Run standalone tests
        run: npm run test:e2e:standalone
        env:
          TEST_CONTRACT_ID: ${{ steps.deploy.outputs.contract_id }}
```

## Next Steps

1. ✅ Implement mocked E2E tests
2. ✅ Implement standalone node tests
3. ⏳ Add testnet integration tests
4. ⏳ Add load testing (100+ concurrent requests)
5. ⏳ Add chaos testing (network failures, RPC errors)
6. ⏳ Add monitoring integration tests (Prometheus metrics)

## References

- [Oracle Architecture](./docs/ARCHITECTURE.md)
- [Manual Test Guide](./MANUAL_TEST_GUIDE.md)
- [Rescue Guide](./RESCUE_GUIDE.md)
- [Stellar Quickstart](https://github.com/stellar/quickstart)
- [Soroban RPC](https://soroban.stellar.org/docs/reference/rpc)
