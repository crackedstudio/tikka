# Webhook Race Condition Fix - Implementation Details

## Quick Summary

**Problem**: Concurrent webhook delivery failures could both read the same stale `failure_count`, increment it independently, and lose updates. Webhooks could fail to disable when they should.

**Solution**: Atomic server-side database increment using PostgreSQL stored procedure.

**Result**: Webhooks now disabled at exactly the right failure threshold, zero lost updates, no race window.

---

## What Changed

### 1. New Database Migration
📁 `backend/database/migrations/014_webhook_atomic_increment.sql`

Creates a stored procedure that atomically:
- Increments `failure_count` at the database level
- Conditionally disables webhook in the **same SQL statement**
- Returns post-increment values in one round-trip

```sql
CREATE OR REPLACE FUNCTION increment_webhook_failure_count(
  p_webhook_id UUID,
  p_max_failures INT DEFAULT 5
)
RETURNS TABLE(failure_count INT, is_active BOOLEAN) AS $$
BEGIN
  RETURN QUERY
  UPDATE webhooks
  SET
    failure_count = failure_count + 1,
    is_active = CASE 
      WHEN (failure_count + 1) >= p_max_failures THEN false 
      ELSE is_active 
    END
  WHERE id = p_webhook_id
  RETURNING webhooks.failure_count, webhooks.is_active;
END;
```

### 2. Updated Service
📁 `backend/src/services/webhook.service.ts` (lines 260-309)

**Before**:
```typescript
const newFailureCount = webhook.failure_count + 1;      // ← STALE READ
const updates: any = { failure_count: newFailureCount };
if (newFailureCount >= MAX_FAILURES) {
  updates.is_active = false;
}
await this.client.from(TABLE).update(updates).eq('id', webhook.id);  // ← SEPARATE UPDATE
```

**After**:
```typescript
const { data, error } = await this.client.rpc('increment_webhook_failure_count', {
  p_webhook_id: webhook.id,
  p_max_failures: MAX_FAILURES,
});

if (error) {
  this.logger.error(`Failed to increment failure count...`, error);
  return;
}

if (data && data.length > 0) {
  const result = data[0];
  const { failure_count: postIncrementCount, is_active: isActive } = result;
  
  if (!isActive) {
    this.logger.warn(`Disabled webhook ${webhook.id} due to ${postIncrementCount} consecutive failures.`);
  } else {
    this.logger.debug(`Incremented failure count for webhook ${webhook.id} to ${postIncrementCount}.`);
  }
}
```

**Why This Works**:
- Single RPC call to database (no separate SELECT+UPDATE)
- Database-level increment (no client-side computation)
- Atomic operation (lock prevents concurrent overwrites)
- Post-increment values returned (no re-read race)

### 3. New Test Suite
📁 `backend/src/services/webhook.service.spec.ts`

14 comprehensive tests covering:
- ✅ Atomic increment verification
- ✅ Disable at MAX_FAILURES threshold
- ✅ Not disabled before threshold
- ✅ Concurrent failure handling (critical)
- ✅ Already-disabled webhook stays disabled
- ✅ No SELECT queries before UPDATE
- ✅ Post-increment values in logging
- ✅ Success case (count reset)
- ✅ Error handling
- ✅ Boundary conditions
- ✅ Retry logic
- ✅ Behavior preservation

---

## How It Fixes the Race

### Original Bug Scenario
```
Thread A: read failure_count = 3
Thread B: read failure_count = 3
Thread A: write failure_count = 4
Thread B: write failure_count = 4  ← overwrites A's write!

Result: failure_count = 4 (only incremented by 1)
Expected: 5 (incremented by 2)
Consequence: Webhook never disabled
```

### Fixed Behavior
```
Thread A: RPC call
  Database: acquires lock
  Database: 3 → 4
  Database: releases lock
  Thread A: gets {failure_count: 4, is_active: true}

Thread B: RPC call (waits for lock)
  Database: acquires lock
  Database: 4 → 5, is_active = false
  Database: releases lock
  Thread B: gets {failure_count: 5, is_active: false}

Result: failure_count = 5, is_active = false ✓ CORRECT
```

---

## Why This Approach

### Why Atomic UPDATE (not transactions)
- **Simpler**: Single SQL statement vs transaction boilerplate
- **Faster**: No connection handling overhead
- **Safer**: Database handles serialization atomically
- **Proven**: Standard pattern for concurrent counters

### Why Not Just Use Transaction?
Could add `SELECT ... FOR UPDATE`, but:
- More complex code
- No performance benefit
- More lock contention potential
- Atomic UPDATE is cleaner

### Why Not Use RETURNING?
We ARE using RETURNING! That's the key:
```sql
UPDATE webhooks ... RETURNING webhooks.failure_count, webhooks.is_active
```
This gives us post-increment values without a separate read.

---

## Deployment

### Step 1: Run Migration
```bash
# In Supabase SQL Editor, execute:
psql -f backend/database/migrations/014_webhook_atomic_increment.sql
```

This creates:
- Function: `increment_webhook_failure_count()`
- Index: `idx_webhooks_id_active`

### Step 2: Deploy Code
```bash
cd backend
npm run test -- webhook.service  # Verify tests pass
npm run lint                      # Verify no violations
git push origin webhook-fix
# Merge PR and deploy normally
```

### Step 3: Verify
- Monitor webhook delivery logs
- Check webhook disable events triggered correctly
- Verify no RPC error spikes

---

## Verification Checklist

✅ **Tests Pass**
- 14 test cases all passing
- Coverage: atomic operation, concurrent failures, boundary conditions, error handling

✅ **No Breaking Changes**
- Method signatures unchanged
- Return values unchanged
- Behavior on success unchanged
- Logging format unchanged

✅ **Race Condition Closed**
- No SELECT before UPDATE (verified in tests)
- Server-side increment (no client computation)
- Atomic operation (CASE WHEN in same statement)
- Post-increment values returned

✅ **Security**
- No SQL injection (parameters as placeholders)
- No privilege issues
- Already-disabled webhooks cannot be re-enabled

---

## Before & After Examples

### Example 1: Webhook at Threshold

**Before (Vulnerable)**:
- Failures 1-4: `failure_count` increments 1, 2, 3, 4
- Failure 5 (Thread A): reads 4, writes 5, disables
- Failure 5 (Thread B concurrent): reads 4, writes 5, disables
- Result: Two threads both write 5, webhook eventually disabled

**After (Fixed)**:
- Failures 1-4: same
- Failure 5 (Thread A): RPC increments 4→5, disables, returns 5
- Failure 5 (Thread B): waits for A, RPC increments 5→6, returns 6
- Result: Correct sequence 1→2→3→4→5 (disabled), webhook never misses threshold

### Example 2: Many Concurrent Failures

**Before (Vulnerable)**:
- 10 concurrent failures at `failure_count = 3`
- All read 3
- All compute 4
- All write 4
- Result: `failure_count` stays at 4, loss of 9 increments!

**After (Fixed)**:
- 10 concurrent failures at `failure_count = 3`
- Each RPC call serialized by database
- Increments: 3→4→5→6→...→12
- Result: All 10 increments counted correctly

---

## FAQ

**Q: Will this affect existing webhooks?**
A: No. The fix only changes how failures are recorded. Existing webhooks continue to work normally.

**Q: What about webhooks that are already disabled?**
A: They stay disabled. The CASE WHEN ensures no re-enabling.

**Q: Does this require downtime?**
A: No. Migration and code deploy can happen independently. Old code works with new function.

**Q: What if the RPC call fails?**
A: Error is logged, webhook delivery continues. Retry on next failure will re-attempt.

**Q: Performance impact?**
A: Neutral or improved. Same DB round-trips, possibly fewer due to no stale-read retries.

**Q: Why not use Redis?**
A: Webhook state lives in Postgres. Adding Redis would complicate deployment and consistency.

---

## Files Summary

| File | Type | Purpose |
|------|------|---------|
| `014_webhook_atomic_increment.sql` | Migration | Creates atomic increment function |
| `webhook.service.ts` | Service | Uses atomic RPC instead of read-then-write |
| `webhook.service.spec.ts` | Tests | 14 tests covering all scenarios |

**Total Changes**: 
- +40 lines (migration)
- -18 lines (old code)
- +440 lines (tests)
- Net: +462 lines

---

## Technical Details

### Database Function Signature
```sql
increment_webhook_failure_count(
  p_webhook_id UUID,
  p_max_failures INT DEFAULT 5
) RETURNS TABLE(failure_count INT, is_active BOOLEAN)
```

### RPC Call Pattern
```typescript
const { data, error } = await client.rpc('increment_webhook_failure_count', {
  p_webhook_id: webhookId,
  p_max_failures: MAX_FAILURES,
});
```

### Return Format
```typescript
data[0] = {
  failure_count: 3,     // post-increment value
  is_active: false      // new state after disable
}
```

### Atomic UPDATE Logic
```sql
UPDATE webhooks
SET
  failure_count = failure_count + 1,  -- server-side increment
  is_active = CASE 
    WHEN (failure_count + 1) >= p_max_failures THEN false
    ELSE is_active
  END
WHERE id = p_webhook_id
```

---

## Related Tests

All new tests in [webhook.service.spec.ts](backend/src/services/webhook.service.spec.ts):

1. **Race Condition Tests**: Verify atomic operation and closed race window
2. **Threshold Tests**: Verify disable at exact MAX_FAILURES
3. **Concurrent Tests**: Verify multiple concurrent failures handled correctly
4. **State Tests**: Verify already-disabled webhooks stay disabled
5. **Behavior Tests**: Verify existing functionality preserved

Run with:
```bash
npm test -- webhook.service
```

---

## References

- Original Race Condition: `webhook.service.ts` lines 260-277
- Fix Location: `webhook.service.ts` lines 283-309
- Migration: `014_webhook_atomic_increment.sql`
- Tests: `webhook.service.spec.ts` (all 14 tests)

---

**Status**: ✅ Ready for Production Deployment
