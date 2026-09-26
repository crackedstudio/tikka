# API Idempotency Specification

## Overview
To prevent duplicate onchain writes, duplicate ticket entries, or redundant database operations caused by network retries or client reconnects, **all mutating endpoints (`POST`, `PUT`, `PATCH`, `DELETE`) in the Tikka REST API require an `Idempotency-Key` header by default**.

## Client Obligation
When sending a mutating HTTP request, the client MUST include a unique `Idempotency-Key` header (typically a V4 UUID):

```http
POST /api/raffles HTTP/1.1
Host: api.tikka.example.com
Authorization: Bearer <token>
Idempotency-Key: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
Content-Type: application/json

{
  "title": "Stellar Community Raffle",
  ...
}
```

### Missing Header Behavior (HTTP 400)
If a client sends a mutating request without an `Idempotency-Key` header on an endpoint that enforces idempotency, the API rejects the request:

```json
{
  "statusCode": 400,
  "message": "Idempotency-Key header is required for mutating requests.",
  "error": "Bad Request"
}
```

## Replay Behavior & Deduplication (No Second Effect)
When a request with a previously completed `Idempotency-Key` is re-sent:
1. The server detects the completed key in Redis cache.
2. The server immediately returns the **identical cached response envelope** (e.g., HTTP 200/201).
3. **Zero second effects occur**: No second Soroban transaction is dispatched, no duplicate raffle record is created, and no extra notification is triggered.

If a request with the same `Idempotency-Key` is currently in flight:
- The server returns **HTTP 409 Conflict** (`A request with this Idempotency-Key is already in progress.`).

## Exemptions (`@SkipIdempotency()`)
Endpoints that do not produce state changes or handle internal deduplication (such as external webhook ingestion endpoints or read operations) are decorated with `@SkipIdempotency()` and do not require the header.
