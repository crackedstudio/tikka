# Transaction Submitter - Quick Reference

## 🚀 Quick Start

```typescript
import { TxSubmitterService } from './submitter/tx-submitter.service';

// Submit randomness with typed outcomes
const outcome = await txSubmitter.submitRandomnessTyped(
  raffleId,
  requestId,
  randomness
);

// Handle outcome
if (outcome.status === 'SUCCESS' || outcome.status === 'DUPLICATE_SUCCESS') {
  console.log(`✅ Confirmed at ledger ${outcome.ledger}`);
} else if (outcome.retriable) {
  console.log(`⚠️ Retriable error: ${outcome.status}`);
  // Retry logic
} else {
  console.error(`❌ Failed: ${outcome.error}`);
}
```

## 📊 Transaction States

```
BUILDING → SIGNING → SUBMITTING → POLLING → [TERMINAL]
```

**Terminal States:**
- ✅ `SUCCESS` - Confirmed on-chain
- ✅ `DUPLICATE_SUCCESS` - Already submitted
- ⚠️ `TIMEOUT` - Polling exhausted (retriable)
- ⚠️ `INSUFFICIENT_FEE` - Fee too low (retriable)
- ⚠️ `NETWORK_ERROR` - RPC failure (retriable)
- ❌ `FAILED` - Rejected by network
- ❌ `INVALID_TRANSACTION` - Malformed/unauthorized

## 🎯 Outcome Types

```typescript
type TransactionOutcome =
  | { status: 'SUCCESS'; txHash: string; ledger: number; feePaid: number; retriable: false }
  | { status: 'DUPLICATE_SUCCESS'; txHash: string; ledger: number; message: string; retriable: false }
  | { status: 'TIMEOUT'; txHash?: string; error: string; retriable: true; pollAttempts: number }
  | { status: 'INSUFFICIENT_FEE'; error: string; retriable: true; currentFee: number }
  | { status: 'NETWORK_ERROR'; error: string; retriable: true; rpcUrl?: string }
  | { status: 'FAILED'; txHash?: string; error: string; retriable: false; failureReason?: string }
  | { status: 'INVALID_TRANSACTION'; error: string; retriable: false; validationError?: string };
```

## 🔄 Error Handling Patterns

### Pattern 1: Simple Success Check

```typescript
const outcome = await txSubmitter.submitRandomnessTyped(raffleId, requestId, randomness);

if (outcome.status === 'SUCCESS' || outcome.status === 'DUPLICATE_SUCCESS') {
  // Success path
  await markJobComplete(outcome.txHash, outcome.ledger);
} else {
  // Error path
  await handleError(outcome);
}
```

### Pattern 2: Retriable vs Non-Retriable

```typescript
const outcome = await txSubmitter.submitRandomnessTyped(raffleId, requestId, randomness);

if (outcome.retriable) {
  // Schedule retry with backoff
  throw new Error(`Retriable: ${outcome.status}`);
} else {
  // Move to dead-letter queue
  await moveToDeadLetter(outcome);
}
```

### Pattern 3: Detailed Error Handling

```typescript
const outcome = await txSubmitter.submitRandomnessTyped(raffleId, requestId, randomness);

switch (outcome.status) {
  case 'SUCCESS':
    await onSuccess(outcome.txHash, outcome.ledger);
    break;
    
  case 'DUPLICATE_SUCCESS':
    await onDuplicate(outcome.txHash, outcome.message);
    break;
    
  case 'TIMEOUT':
    await onTimeout(outcome.pollAttempts);
    break;
    
  case 'INSUFFICIENT_FEE':
    await onInsufficientFee(outcome.currentFee);
    break;
    
  case 'NETWORK_ERROR':
    await onNetworkError(outcome.rpcUrl);
    break;
    
  case 'FAILED':
    await onFailed(outcome.failureReason);
    break;
    
  case 'INVALID_TRANSACTION':
    await onInvalid(outcome.validationError);
    break;
}
```

## ⚙️ Configuration

### Environment Variables

```bash
# Required
RAFFLE_CONTRACT_ID=CCONTRACT123...

# RPC Configuration
SOROBAN_RPC_URL=https://soroban-mainnet.stellar.org
SOROBAN_RPC_FALLBACK_URLS=https://rpc2.stellar.org,https://rpc3.stellar.org

# Network
NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015

# Retry Configuration
TX_SUBMIT_MAX_ATTEMPTS=5
TX_SUBMIT_INITIAL_BACKOFF_MS=1000

# Alerting
TX_SUBMIT_ALERT_WEBHOOK_URL=https://alerts.example.com/webhook
```

### Polling Parameters

```typescript
POLL_TIMEOUT_MS = 30000;  // 30 seconds
POLL_INTERVAL_MS = 1000;  // 1 second
```

## 🔍 Error Classification

| Error Pattern | Status | Retriable | Action |
|--------------|--------|-----------|--------|
| `tx_insufficient_fee` | INSUFFICIENT_FEE | ✅ | Bump fee |
| `tx_duplicate` | DUPLICATE_SUCCESS | ❌ | Query existing |
| `504`, `timeout` | TIMEOUT | ✅ | Poll hash |
| `ECONNREFUSED`, `503` | NETWORK_ERROR | ✅ | Failover RPC |
| `invalid`, `malformed` | INVALID_TRANSACTION | ❌ | Abort |
| `FAILED` status | FAILED | ❌ | Log & report |

## 📝 Telemetry

### Log Format

```json
{
  "message": "Transaction completed: SUCCESS",
  "txHash": "abc123def456",
  "raffleId": 100,
  "requestId": "req-1",
  "finalOutcome": "SUCCESS",
  "currentState": "POLLING",
  "attempt": 1,
  "timestamp": "2026-05-30T12:00:00.000Z",
  "durationMs": 2341,
  "feePaid": 1000
}
```

### Log Levels

- **ERROR**: `FAILED`, `INVALID_TRANSACTION`
- **WARN**: `TIMEOUT`, `NETWORK_ERROR`, retries
- **LOG**: `SUCCESS`, `DUPLICATE_SUCCESS`, state transitions

## 🧪 Testing

### Run Tests

```bash
cd oracle

# All tests
npm test

# Submitter tests only
npm test -- tx-submitter.service.spec.ts

# With coverage
npm test -- --coverage tx-submitter.service.spec.ts
```

### Mock Setup

```typescript
const mockRpcServer = {
  sendTransaction: jest.fn(),
  getTransaction: jest.fn(),
  getAccount: jest.fn(),
  prepareTransaction: jest.fn(),
};

// Success
mockRpcServer.sendTransaction.mockResolvedValue({ hash: 'tx123' });
mockRpcServer.getTransaction.mockResolvedValue({ status: 'SUCCESS', ledger: 100 });

// Duplicate
mockRpcServer.sendTransaction.mockResolvedValue({ hash: 'tx123', error: 'duplicate' });

// Timeout
mockRpcServer.getTransaction.mockResolvedValue({ status: 'NOT_FOUND' });

// Network Error
mockRpcServer.sendTransaction.mockRejectedValue(new Error('ECONNREFUSED'));
```

## 🔧 Common Operations

### Check RPC Health

```typescript
const status = await txSubmitter.getRpcStatus();
console.log(status);
// [
//   { url: 'https://rpc1.stellar.org', healthy: true },
//   { url: 'https://rpc2.stellar.org', healthy: false }
// ]
```

### Submit with Custom Request ID

```typescript
const outcome = await txSubmitter.submitRandomnessTyped(
  raffleId,
  `custom-req-${Date.now()}`,
  randomness
);
```

### Legacy Method (Deprecated)

```typescript
// Old way (backward compatibility)
const result = await txSubmitter.submitRandomness(raffleId, randomness);
if (result.success) {
  console.log(`Success: ${result.txHash}`);
}
```

## 📈 Performance

### Latency

- **Typical Success**: 2-5 seconds
- **With Retry**: 5-15 seconds
- **Timeout**: 30+ seconds

### Retry Strategy

```
Attempt 1: 1000ms backoff
Attempt 2: 2000ms backoff
Attempt 3: 4000ms backoff
Attempt 4: 8000ms backoff
Attempt 5: 16000ms backoff
Max: 60000ms (1 minute)
```

### Fee Bumping

```
Initial: Network estimate
Bump: feeBump = max(feeBump * 2, feeBump + 1)
Trigger: INSUFFICIENT_FEE errors
```

## 🚨 Troubleshooting

### High Retry Rate

```bash
# Check RPC health
curl https://soroban-mainnet.stellar.org/health

# Review logs for patterns
grep "NETWORK_ERROR" logs.json | jq .rpcUrl | sort | uniq -c

# Check fee estimates
grep "fee" logs.json | jq .feePaid | stats
```

### Frequent Timeouts

```bash
# Increase timeout (if needed)
POLL_TIMEOUT_MS=60000

# Add backup RPCs
SOROBAN_RPC_FALLBACK_URLS=https://rpc2.stellar.org,https://rpc3.stellar.org

# Check network latency
ping soroban-mainnet.stellar.org
```

### Duplicate Errors

```bash
# Check for concurrent submissions
grep "DUPLICATE_SUCCESS" logs.json | jq .raffleId | sort | uniq -c

# Review queue deduplication
# Verify idempotency keys
```

## 📚 Related Documentation

- [Comprehensive Guide](./TX_SUBMITTER_GUIDE.md) - Full implementation details
- [Implementation](./tx-submitter.service.ts) - Source code
- [Tests](./tx-submitter.service.spec.ts) - Test suite
- [Fee Estimator](./fee-estimator.service.ts) - Fee estimation service

## ✅ Checklist

**Before Deployment:**
- [ ] `RAFFLE_CONTRACT_ID` configured
- [ ] `SOROBAN_RPC_URL` set to correct network
- [ ] Backup RPCs configured
- [ ] Alert webhook configured (optional)
- [ ] Tests passing: `npm test`
- [ ] Build successful: `npm run build`
- [ ] Lint passing: `npm run lint`

**Monitoring:**
- [ ] Success rate > 95%
- [ ] Average confirmation time < 10s
- [ ] Retry rate < 20%
- [ ] Dead-letter queue depth < 10

## 🎯 Key Takeaways

1. **Always use `submitRandomnessTyped()`** for new code
2. **Check `outcome.status`** - never assume success
3. **Use `outcome.retriable`** to determine retry strategy
4. **Log with full context** - include txHash, raffleId, requestId
5. **Handle duplicates gracefully** - they're functional successes
6. **Configure backup RPCs** for high availability
7. **Monitor success rates** and alert on degradation

---

**Status:** ✅ Production Ready  
**Version:** 1.0.0  
**Last Updated:** 2026-05-30
