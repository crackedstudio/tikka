# Metadata Upsert Idempotency

## Overview

The `PUT /raffles/:id/metadata` endpoint implements idempotency to prevent duplicate metadata writes when clients retry requests after network timeouts or other transient failures.

## How It Works

The endpoint uses the `IdempotencyInterceptor` which provides:

- **24-hour idempotency window**: Duplicate requests with the same `Idempotency-Key` within 24 hours return the cached response
- **Conflict detection**: Returns HTTP 409 if a request with the same key is currently in-progress
- **Automatic caching**: The first successful response is cached and returned for subsequent requests with the same key

## Client Usage

### Required Header

```http
POST /raffles/42/metadata
Authorization: Bearer <jwt-token>
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "title": "My Raffle",
  "description": "A test raffle"
}
```

### Generating Idempotency Keys

Clients should generate a **UUID v4** for each unique metadata upsert operation:

```typescript
import { v4 as uuidv4 } from 'uuid';

const idempotencyKey = uuidv4(); // e.g., "550e8400-e29b-41d4-a716-446655440000"

await fetch('/raffles/42/metadata', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Idempotency-Key': idempotencyKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    title: 'My Raffle',
    description: 'A test raffle',
  }),
});
```

### Key Management

- **Generate once per operation**: Create a new UUID before attempting the request
- **Retry with same key**: If the request fails (network timeout, 5xx error), retry with the **same** idempotency key
- **New operation = new key**: For a different metadata update, generate a **new** UUID

## Response Codes

| Status | Description |
|--------|-------------|
| 201 | Metadata created/updated successfully (first request) |
| 201 | Cached response returned (duplicate request) |
| 409 | Conflict - A request with this Idempotency-Key is already in-progress |
| 401 | Unauthorized - Missing or invalid JWT token |
| 403 | Forbidden - Not authorized to update this raffle's metadata |

## Implementation Details

### Storage

Idempotency state is stored in **Redis** with the following structure:

```
Key: idem:{wallet_address}:{idempotency_key}
Value: {"status": "done", "response": {...}}
TTL: 24 hours (86400 seconds)
```

### Lock Mechanism

The implementation uses Redis `SET NX` (set if not exists) to provide atomic locking:

1. First request: Acquires lock with `SET NX`, processes request, stores response
2. Duplicate request: Finds existing `done` response, returns it immediately
3. Concurrent request: Lock acquisition fails, returns HTTP 409

### Scoping

Idempotency keys are scoped by:
- **Wallet address**: Different users can use the same UUID
- **Idempotency key**: The UUID provided in the header

This means:
- User A with key `abc-123` and User B with key `abc-123` are **independent**
- User A with key `abc-123` and User A with key `def-456` are **independent**

## Testing

Tests verify:

1. ✅ First request processes normally and caches response
2. ✅ Duplicate request returns cached response without calling service
3. ✅ Service method called only once per unique idempotency key
4. ✅ Different keys for same user are independent
5. ✅ Same key for different users are independent

See `raffles.controller.spec.ts` for test implementation.

## Best Practices

### For API Clients

1. **Always use idempotency keys** for metadata upserts to ensure safe retries
2. **Store the key** before making the request (e.g., in local state or database)
3. **Retry with the same key** if you receive a network error or 5xx status
4. **Don't retry 4xx errors** (except 409) - these indicate client errors that won't succeed on retry
5. **Handle 409 gracefully** - wait and retry with exponential backoff

### For Server Operators

1. **Monitor Redis health** - idempotency depends on Redis availability
2. **Set appropriate REDIS_URL** in environment configuration
3. **Monitor 409 responses** - high rates may indicate client retry issues
4. **Plan for cache eviction** - responses are cached for 24 hours

## Related Documentation

- [Idempotency Interceptor](../src/common/idempotency/idempotency.interceptor.ts)
- [Idempotency Service](../src/common/idempotency/idempotency.service.ts)
- [ENV_VARS.md](../src/config/ENV_VARS.md) - Redis configuration
