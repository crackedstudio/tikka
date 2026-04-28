# Oracle E2E Test Suite

## Overview

This directory contains comprehensive end-to-end tests for the Tikka oracle system, verifying the complete flow from event detection through randomness computation to transaction submission.

## Test Files

### 1. `e2e-oracle-flow.spec.ts`

**Purpose:** Mocked integration tests for the complete oracle cycle

**What it tests:**
- Event listener receives and parses `RandomnessRequested` events
- Queue job creation and processing
- VRF path for high-stakes raffles (≥ 500 XLM)
- PRNG path for low-stakes raffles (< 500 XLM)
- Transaction submission to Soroban RPC
- Idempotency (duplicate event handling)
- Error handling and recovery
- Performance benchmarks
- Lag monitoring integration

**Dependencies:** None (fully mocked)

**Run:**
```bash
npm run test:e2e:mocked
```

### 2. `e2e-standalone-node.spec.ts`

**Purpose:** Integration tests against a real local Soroban standalone node

**What it tests:**
- Real transaction building and submission
- Actual Soroban RPC interaction
- Contract state changes after randomness submission
- Transaction confirmation on blockchain
- Fee estimation accuracy
- Multi-request handling
- Idempotency on real chain

**Dependencies:**
- Docker (for standalone node)
- Deployed test contract

**Run:**
```bash
# Start standalone node
docker run --rm -it -p 8000:8000 \
  --name stellar \
  stellar/quickstart:testing \
  --standalone

# Deploy contract and run tests
./scripts/deploy-test-contract.sh
npm run test:e2e:standalone
```

## Quick Start

### Run All Tests (Automated)

```bash
npm run test:e2e:full
```

This will:
1. Start standalone node in Docker
2. Deploy test contract
3. Run all E2E tests
4. Clean up automatically

### Run Mocked Tests Only

```bash
npm run test:e2e:mocked
```

Fast, no external dependencies required.

### Run Standalone Tests Only

```bash
# Prerequisites
export TEST_CONTRACT_ID=<your_contract_id>

# Run
npm run test:e2e:standalone
```

## Test Scenarios

### ✅ Low-Stakes PRNG Flow

```
Event (prize < 500 XLM)
  → EventListener
  → Queue
  → Worker (determines PRNG)
  → PrngService.compute()
  → TxSubmitter.submitRandomness()
  → ✓ Transaction confirmed
```

**Expected time:** < 2 seconds

### ✅ High-Stakes VRF Flow

```
Event (prize ≥ 500 XLM)
  → EventListener
  → Queue
  → Worker (determines VRF)
  → VrfService.compute()
  → TxSubmitter.submitRandomness()
  → ✓ Transaction confirmed with proof
```

**Expected time:** < 5 seconds

### ✅ Idempotency Check

```
Event (raffle_id: 1)
  → Worker processes
  → Transaction submitted
  → ✓ Success

Event (raffle_id: 1) [duplicate]
  → Worker checks contract
  → Already finalized
  → ✓ Skipped (no error)
```

### ✅ Error Recovery

```
Event
  → Worker processes
  → RPC error
  → Retry with backoff
  → ✓ Eventually succeeds or alerts
```

## Performance Benchmarks

| Metric | Target | Status |
|--------|--------|--------|
| Event → Queue | < 100ms | ✅ |
| Queue → Worker | < 500ms | ✅ |
| PRNG Computation | < 50ms | ✅ |
| VRF Computation | < 200ms | ✅ |
| Transaction Build | < 100ms | ✅ |
| Transaction Submit | < 1s | ✅ |
| **Total (PRNG)** | **< 2s** | ✅ |
| **Total (VRF)** | **< 5s** | ✅ |

## Test Coverage

Run with coverage:

```bash
npm test -- --coverage --testMatch='**/test/e2e-*.spec.ts'
```

Target coverage:
- Statements: > 80%
- Branches: > 75%
- Functions: > 80%
- Lines: > 80%

## Debugging

### Enable Verbose Logging

```bash
LOG_LEVEL=debug npm run test:e2e:mocked
```

### Inspect Standalone Node

```bash
# Check node health
curl -X POST http://localhost:8000/soroban/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'

# Check contract state
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source test-admin \
  --rpc-url http://localhost:8000/soroban/rpc \
  --network-passphrase "Standalone Network ; February 2017" \
  -- \
  get_raffle_data \
  --raffle_id 1
```

### View Docker Logs

```bash
docker logs stellar -f
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e-mocked:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:e2e:mocked

  e2e-standalone:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - name: Start standalone node
        run: |
          docker run -d --name stellar -p 8000:8000 \
            stellar/quickstart:testing --standalone
          sleep 10
      - name: Deploy contract
        run: ./scripts/deploy-test-contract.sh
      - name: Run tests
        run: npm run test:e2e:standalone
```

## Troubleshooting

### Tests timeout

**Cause:** Standalone node not running

**Fix:**
```bash
docker ps | grep stellar
# If not running:
docker run -d -p 8000:8000 --name stellar \
  stellar/quickstart:testing --standalone
```

### Contract not found

**Cause:** Contract not deployed or wrong ID

**Fix:**
```bash
./scripts/deploy-test-contract.sh
export TEST_CONTRACT_ID=<output_contract_id>
```

### Transaction fails

**Cause:** Oracle account not funded

**Fix:**
```bash
curl "http://localhost:8000/friendbot?addr=<ORACLE_PUBLIC_KEY>"
```

### Port already in use

**Cause:** Another process using port 8000

**Fix:**
```bash
# Find and kill process
lsof -ti:8000 | xargs kill -9
# Or use different port
docker run -d -p 8001:8000 --name stellar \
  stellar/quickstart:testing --standalone
```

## Best Practices

1. **Always run mocked tests first** - They're fast and catch most issues
2. **Use standalone tests for integration verification** - Slower but comprehensive
3. **Clean up after tests** - Stop Docker containers when done
4. **Check logs on failure** - Docker logs provide detailed error info
5. **Use descriptive test names** - Makes debugging easier
6. **Keep tests independent** - Each test should work in isolation

## Next Steps

- [ ] Add testnet integration tests
- [ ] Add load testing (100+ concurrent requests)
- [ ] Add chaos testing (network failures, RPC errors)
- [ ] Add monitoring integration tests
- [ ] Add multi-oracle coordination tests
- [ ] Add commit-reveal flow tests

## Resources

- [E2E Test Guide](../E2E_TEST_GUIDE.md) - Comprehensive testing documentation
- [Oracle README](../README.md) - Oracle architecture and setup
- [Manual Test Guide](../MANUAL_TEST_GUIDE.md) - Manual testing procedures
- [Stellar Quickstart](https://github.com/stellar/quickstart) - Standalone node docs
- [Soroban RPC](https://soroban.stellar.org/docs/reference/rpc) - RPC API reference
