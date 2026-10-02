# Sequence Number Safety in Tikka SDK

## Overview

Stellar transactions are ordered by account **sequence number**. When you submit a transaction, its sequence must match the account's current sequence. If two transactions use the same sequence, one succeeds and the other fails with **TX_BAD_SEQ**.

This document explains:
1. **The problem** — why concurrent operations collide on sequence numbers
2. **The solution** — how the SDK prevents and recovers from collisions
3. **The contract** — who is responsible for sequencing (the SDK or the consumer)
4. **Best practices** — when and how to use concurrent operations safely

## The Problem: Sequence Collisions

### What Happens

When you fire two operations concurrently from the same Stellar account:

```typescript
// Both operations start simultaneously
const op1 = sdk.invoke('buy_ticket', [raffleId]);
const op2 = sdk.invoke('cancel_raffle', [raffleId]);

// Both may fetch the same sequence number from Horizon
// One succeeds, the other fails with TX_BAD_SEQ
```

Why?
1. Operation 1 fetches account from Horizon → sequence = 100
2. Operation 2 fetches account from Horizon → sequence = 100 (same!)
3. Operation 1 submits with sequence 100 → SUCCESS
4. Operation 2 submits with sequence 100 → **TX_BAD_SEQ** (sequence already used)

### Why This Is Bad

- **Silent failure**: TX_BAD_SEQ looks like any other error; the caller doesn't know it's retryable
- **Lost transaction**: The operation fails without retrying automatically
- **Difficult debugging**: Errors happen intermittently (only under concurrent load)

## The Solution: Per-Account Sequence Locking

The SDK prevents collisions using **SequenceManager** — a per-account promise-based lock.

### How It Works

```
Operation 1 arrives → acquires lock for account
                   → fetches sequence (100)
                   → builds, signs, submits tx
                   → releases lock

Operation 2 arrives → waits for lock (Operation 1 holds it)
                   → lock released
                   → acquires lock
                   → fetches sequence (101) — incremented!
                   → builds, signs, submits tx
                   → releases lock
```

**Result**: Both operations complete successfully, with strictly serialized sequence numbers.

### Behavior

- **Same account**: Operations are serialized (one at a time)
- **Different accounts**: Operations run in parallel (no blocking)
- **Deterministic**: Each account's operations execute in FIFO order

### Example

```typescript
const sdk = new ContractService(...);

// Safe to fire concurrently — SDK serializes internally
const [result1, result2] = await Promise.all([
  sdk.invoke('buy_ticket', [raffleId]),
  sdk.invoke('buy_ticket', [raffleId]),
]);

// Both succeed (or both fail with clear errors — never TX_BAD_SEQ)
```

## The Contract: Ownership of Sequencing

**The SDK handles sequencing for you.**

### What the SDK Does

✅ Acquires a per-account lock before fetching sequence  
✅ Ensures only one operation fetches/increments sequence at a time  
✅ Detects TX_BAD_SEQ errors and retries with refetched sequence  
✅ Maintains FIFO ordering for operations from the same account  
✅ Allows parallel operations from different accounts  

### What You (the Consumer) Do

✅ Fire operations concurrently without worrying about sequence collisions  
✅ Handle `TX_BAD_SEQ` errors by retrying (SDK retries automatically, but you can too)  
✅ Use different accounts if you need true parallelism (no serialization)  

### What You Should NOT Do

❌ Manage sequence numbers manually (don't call `account.incrementSequenceNumber()` directly)  
❌ Assume you can share one account across multiple processes (sequence lock is per-process)  
❌ Build transactions before acquiring sequence (SDK does this inside the lock)  

## Error Handling: TX_BAD_SEQ

### Detecting TX_BAD_SEQ

```typescript
import { isTxBadSeqError, classifyError } from '@tikka/sdk';

try {
  await sdk.invoke('buy_ticket', [raffleId]);
} catch (error: any) {
  // Check if this is TX_BAD_SEQ
  if (isTxBadSeqError(error.message)) {
    console.log('Sequence collision detected');
  }

  // Or use the classifier
  const classification = classifyError(error);
  // Returns: 'transient' | 'tx_bad_seq' | 'not_retryable'

  if (classification === 'tx_bad_seq') {
    console.log('This is retryable — sequence was incremented');
  }
}
```

### Automatic Retry (SDK)

The SDK automatically retries on `TX_BAD_SEQ`:

```typescript
// Inside TransactionLifecycle.invoke():
// 1. Try operation
// 2. If TX_BAD_SEQ: refetch sequence, retry once
// 3. If still fails: throw with retry context
```

### Manual Retry (You)

If you need custom retry logic:

```typescript
import { retryOnTxBadSeq } from '@tikka/sdk';

const result = await retryOnTxBadSeq(
  async () => sdk.invoke('buy_ticket', [raffleId]),
  async () => horizon.loadAccount(sourcePublicKey),
  { maxAttempts: 3 },
);

if (result.success) {
  console.log('Operation succeeded after', result.attempts, 'attempts');
} else {
  console.log('Operation failed:', result.error);
}
```

## Multi-Account Operations

If you use different accounts, operations run in parallel:

```typescript
// Two different accounts — no serialization
const op1 = sdk.invoke('buy_ticket', [raffleId], { sourcePublicKey: account1 });
const op2 = sdk.invoke('buy_ticket', [raffleId], { sourcePublicKey: account2 });

const [result1, result2] = await Promise.all([op1, op2]);
// Both likely complete in parallel
```

## Multi-Process/Instance Safety

**IMPORTANT**: The sequence lock is per-process. If you run multiple instances of your application (or multiple workers in a process pool), they each have their own lock.

### Problem

```
Process A                  Process B
├─ Lock for account
├─ Fetch seq = 100
├─ Submit tx with seq 100
│                         ├─ Lock for account (different lock!)
│                         ├─ Fetch seq = 100 (Horizon hasn't updated yet)
│                         ├─ Submit tx with seq 100 — TX_BAD_SEQ!
```

### Solution

For multi-instance safety, use a **distributed lock** (Redis, DynamoDB, etc.):

```typescript
import { SequenceManager } from '@tikka/sdk';
import Redis from 'redis';

const redis = Redis.createClient();

// Option 1: Use your own lock before invoke()
const lockKey = `seq:lock:${sourcePublicKey}`;
const acquired = await redis.set(lockKey, Date.now(), 'EX', 60, 'NX');

if (acquired) {
  try {
    const result = await sdk.invoke('buy_ticket', [raffleId]);
  } finally {
    await redis.del(lockKey);
  }
} else {
  throw new Error('Could not acquire lock — another instance is using this account');
}

// Option 2: Extend SequenceManager with a distributed backend
class DistributedSequenceManager extends SequenceManager {
  async lock(accountId: string) {
    // Acquire lock from Redis
    const acquired = await redis.set(`seq:${accountId}`, ..., 'NX');
    // ... return release function that deletes from Redis
  }
}
```

## Testing Concurrent Operations

### Unit Test Example

```typescript
import { SequenceManager } from '@tikka/sdk';

describe('concurrent operations', () => {
  it('should handle two concurrent invokes from same account', async () => {
    const sdk = new ContractService(...);
    const sourceKey = 'GAAAA...';

    // Fire two operations concurrently
    const [result1, result2] = await Promise.all([
      sdk.invoke('buy_ticket', [1], { sourcePublicKey: sourceKey }),
      sdk.invoke('buy_ticket', [2], { sourcePublicKey: sourceKey }),
    ]);

    // Both should complete (either success or clear error)
    expect(result1).toBeDefined();
    expect(result2).toBeDefined();

    // Neither should be TX_BAD_SEQ
    expect(String(result1.error || '')).not.toMatch(/bad.*seq/i);
    expect(String(result2.error || '')).not.toMatch(/bad.*seq/i);
  });

  it('should maintain FIFO order for concurrent operations', async () => {
    const sdk = new ContractService(...);
    const executionOrder: number[] = [];

    // Spy on Horizon.loadAccount to track execution order
    jest.spyOn(horizon, 'loadAccount').mockImplementation(async (key) => {
      executionOrder.push(executionOrder.length);
      return account;
    });

    await Promise.all([
      sdk.invoke('op1', []),
      sdk.invoke('op2', []),
      sdk.invoke('op3', []),
    ]);

    // Should execute in FIFO order
    expect(executionOrder).toEqual([0, 1, 2]);
  });
});
```

## Monitoring and Debugging

### Check Pending Locks

```typescript
import { SequenceManager } from '@tikka/sdk';

const manager = new SequenceManager();

// ... operations ...

console.log('Pending locks:', manager.pendingLocks()); // 0 when idle
```

### Log Sequence Events

```typescript
// Add debugging to track sequence fetches
class DebugLifecycle extends TransactionLifecycle {
  async buildTx(...) {
    console.log('Fetching sequence for', sourceKey);
    const account = await horizon.loadAccount(sourceKey);
    console.log('Sequence:', account.sequenceNumber());
    return super.buildTx(...);
  }
}
```

### Monitor TX_BAD_SEQ Occurrences

```typescript
import { classifyError } from '@tikka/sdk';

let txBadSeqCount = 0;

try {
  await sdk.invoke(...);
} catch (error: any) {
  if (classifyError(error) === 'tx_bad_seq') {
    txBadSeqCount++;
    console.warn('TX_BAD_SEQ collision detected', { txBadSeqCount });
  }
}
```

## FAQ

### Q: Can I use the same account from multiple processes?

**A**: Only with a distributed lock. The SDK's `SequenceManager` is per-process. For production multi-instance deployments, implement a distributed lock using Redis or your database.

### Q: What if I don't use concurrent operations?

**A**: You don't need to worry about sequencing at all. The SDK handles it automatically, whether you use concurrent operations or not.

### Q: What if my operation fails with TX_BAD_SEQ?

**A**: The SDK automatically retries once (refetching the sequence). If it still fails, the error is re-thrown with retry context. You can catch and manually retry if needed using `retryOnTxBadSeq()`.

### Q: How many concurrent operations can I fire?

**A**: As many as you want. The SDK queues them in FIFO order for each account. Be aware that they'll be serialized (each waits for the previous to complete).

### Q: What about read-only operations (like simulateReadOnly)?

**A**: Read-only operations don't need sequence locks because they don't modify account state. They can run concurrently without issues.

### Q: Can I customize the retry strategy?

**A**: Yes. Use `retryOnTxBadSeq()` with custom `maxAttempts` or implement your own retry logic by catching and classifying errors with `classifyError()`.

## References

- [Stellar Sequence Numbers](https://developers.stellar.org/docs/learn/basics/transactions#sequence-number)
- [TX_BAD_SEQ Error Code](https://developers.stellar.org/docs/learn/fundamentals/transactions#operation-results)
- `sdk/src/contract/sequence.manager.ts` — Implementation
- `sdk/src/contract/sequence.errors.ts` — Error detection and retry
