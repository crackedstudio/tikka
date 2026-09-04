# Validation Schemas Inventory

> Complete index of all Zod validation schemas used throughout the Tikka backend.

---

## Quick Index

| Module | Endpoint | Schema | Status |
|--------|----------|--------|--------|
| **Auth** | `GET /auth/nonce` | `GetNonceQuerySchema` | ✅ Validated |
| **Auth** | `POST /auth/verify` | `VerifyBodySchema` | ✅ Validated |
| **Raffles** | `GET /raffles` | `ListRafflesQuerySchema` | ✅ Validated |
| **Raffles** | `POST /raffles/:raffleId/metadata` | `UpsertMetadataSchema` | ✅ Validated |
| **Notifications** | `POST /notifications/subscribe` | `SubscribeSchema` | ✅ Validated |
| **Users** | `GET /users/:address/history` | `UserHistoryQuerySchema` | ✅ Validated |
| **Leaderboard** | `GET /leaderboard` | `LeaderboardQuerySchema` | ✅ Validated |
| **Search** | `GET /search` | `SearchQuerySchema` | ✅ Validated |
| **Support** | `POST /support` | `SupportSchema` | ✅ Validated |
| **Monitor** | `GET /monitor/jobs` | `JobsQuerySchema` | ✅ Validated |
| **Monitor** | `GET /monitor/latency` | `LatencyQuerySchema` | ✅ Validated |
| **Monitor** | `GET /monitor/errors` | `ErrorsQuerySchema` | ✅ Validated |

---

## By Module

### Auth Module

**File:** `src/auth/auth.schema.ts`

#### GetNonceQuerySchema
```typescript
{
  address: string (required, non-empty)
}
```
**Endpoint:** `GET /auth/nonce?address=G...`  
**Example Request:** `GET /auth/nonce?address=GBRPYHIL2CI57XMENQUO4RSYQEBAN5LMQBKMOHXI2BGYJYUCGOZVWB5V`  
**Example Error:**
```json
{
  "statusCode": 400,
  "message": "address cannot be empty",
  "errors": [...]
}
```

#### VerifyBodySchema
```typescript
{
  address: string (required, non-empty)
  signature: string (required, non-empty)
  nonce: string (required, non-empty)
  issuedAt?: string
}
```
**Endpoint:** `POST /auth/verify`  
**Example Request:**
```json
{
  "address": "GBRPYHIL2CI57XMENQUO4RSYQEBAN5LMQBKMOHXI2BGYJYUCGOZVWB5V",
  "signature": "signature_hex_string",
  "nonce": "nonce_value",
  "issuedAt": "2024-01-15T10:30:00Z"
}
```

---

### Raffles Module

#### ListRafflesQuerySchema

**File:** `src/api/rest/raffles/dto/list-raffles-query.dto.ts`

```typescript
{
  status?: string
  category?: string
  creator?: string
  asset?: string
  limit?: number (1–100, default 20)
  offset?: number (≥0, default 0)
}
```

**Endpoint:** `GET /raffles`  
**Example Request:** `GET /raffles?limit=50&offset=10&status=open`  
**Valid Response:**
```json
{
  "raffles": [...],
  "total": 150
}
```
**Invalid Response (limit > 100):**
```json
{
  "statusCode": 400,
  "message": "Number must be less than or equal to 100",
  "errors": [...]
}
```

#### UpsertMetadataSchema

**File:** `src/api/rest/raffles/metadata.schema.ts`

```typescript
{
  title?: string
  description?: string
  image_url?: string | null
  image_urls?: string[] | null
  category?: string | null
  metadata_cid?: string | null
}
```

**Endpoint:** `POST /raffles/:raffleId/metadata`  
**Example Request:**
```json
{
  "title": "Summer Raffle",
  "description": "Win amazing prizes!",
  "image_url": "https://example.com/image.png",
  "category": "summer",
  "metadata_cid": "QmXxxxxxxxxxxx"
}
```

---

### Notifications Module

#### SubscribeSchema

**File:** `src/api/rest/notifications/dto/subscribe.dto.ts`

```typescript
{
  raffleId: number (positive integer)
  channel?: 'email' | 'push' (default: 'email')
}
```

**Endpoint:** `POST /notifications/subscribe`  
**Example Request:**
```json
{
  "raffleId": 42,
  "channel": "email"
}
```
**Invalid Response (negative raffleId):**
```json
{
  "statusCode": 400,
  "message": "Number must be greater than 0",
  "errors": [...]
}
```

---

### Users Module

#### UserHistoryQuerySchema

**File:** `src/api/rest/users/dto/user-history-query.dto.ts`

```typescript
{
  limit?: number (1–100, default 20)
  offset?: number (≥0, default 0)
}
```

**Endpoint:** `GET /users/:address/history`  
**Example Request:** `GET /users/GBRPY.../history?limit=50&offset=0`  
**Path Parameter:** `address` (Stellar address, validated manually)

---

### Leaderboard Module

#### LeaderboardQuerySchema

**File:** `src/api/rest/leaderboard/dto/leaderboard-query.dto.ts`

```typescript
{
  by?: 'wins' | 'volume' | 'tickets' (default: 'wins')
  limit?: number (1–100, default 20)
}
```

**Endpoint:** `GET /leaderboard`  
**Example Request:** `GET /leaderboard?by=volume&limit=100`  
**Invalid Response (invalid sort field):**
```json
{
  "statusCode": 400,
  "message": "Invalid enum value",
  "errors": [...]
}
```

---

### Search Module

#### SearchQuerySchema

**File:** `src/api/rest/search/dto/search-query.dto.ts`

```typescript
{
  q: string (required)
  limit?: number (1–100, default 20)
  offset?: number (≥0, default 0)
}
```

**Endpoint:** `GET /search`  
**Example Request:** `GET /search?q=summer%20raffle&limit=20&offset=0`  
**Controller-level Check:** If `q.length < 2`, returns empty results

---

### Support Module

#### SupportSchema

**File:** `src/api/rest/support/dto/support.dto.ts`

```typescript
{
  name: string (2+ chars, required)
  email: string (valid email, required)
  subject: string (5+ chars, required)
  message: string (10+ chars, required)
}
```

**Endpoint:** `POST /support`  
**Example Request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "subject": "Bug Report",
  "message": "I found a critical bug in the raffle system..."
}
```
**Invalid Response (short subject):**
```json
{
  "statusCode": 400,
  "message": "Please enter a short subject.",
  "errors": [...]
}
```

---

### Monitor Module

#### JobsQuerySchema

**File:** `src/api/rest/monitor/dto/jobs-query.dto.ts`

```typescript
{
  status?: 'pending' | 'completed' | 'failed'
  limit?: number (1–200, default 50)
  cursor?: string
}
```

**Endpoint:** `GET /monitor/jobs`  
**Example Request:**
```
GET /monitor/jobs?status=completed&limit=25
```
**Requires:** Admin authentication

#### LatencyQuerySchema

**File:** `src/api/rest/monitor/dto/latency-query.dto.ts`

```typescript
{
  from?: string (ISO 8601 datetime)
  to?: string (ISO 8601 datetime)
}
```

**Endpoint:** `GET /monitor/latency`  
**Example Request:**
```
GET /monitor/latency?from=2024-01-01T00:00:00Z&to=2024-01-31T23:59:59Z
```
**Invalid Response (malformed datetime):**
```json
{
  "statusCode": 400,
  "message": "Invalid datetime format for 'from'",
  "errors": [...]
}
```

#### ErrorsQuerySchema

**File:** `src/api/rest/monitor/dto/errors-query.dto.ts`

```typescript
{
  limit?: number (1–200, default 50)
}
```

**Endpoint:** `GET /monitor/errors`  
**Example Request:**
```
GET /monitor/errors?limit=100
```

---

## Validation Rules Summary

### String Fields

| Rule | Example | Result |
|------|---------|--------|
| `.min(n)` | `.min(1)` | Must be at least 1 character |
| `.max(n)` | `.max(255)` | Must be at most 255 characters |
| `.email()` | `email: z.string().email()` | Must be valid email |
| `.url()` | `.url()` | Must be valid URL |
| `.regex(pattern)` | `.regex(/^\w+$/)` | Must match regex |
| `.trim()` | `.trim()` | Whitespace removed automatically |

### Number Fields

| Rule | Example | Result |
|------|---------|--------|
| `.min(n)` | `.min(1)` | Must be ≥ 1 |
| `.max(n)` | `.max(100)` | Must be ≤ 100 |
| `.int()` | `.int()` | Must be integer |
| `.positive()` | `.positive()` | Must be > 0 |
| `.coerce` | `.coerce.number()` | Auto-convert from string |

### Enum Fields

| Rule | Example | Result |
|------|---------|--------|
| `.enum([...])` | `z.enum(['a', 'b'])` | Must match one value |

### Special Fields

| Rule | Example | Result |
|------|---------|--------|
| `.optional()` | `z.string().optional()` | Field can be omitted |
| `.nullable()` | `z.string().nullable()` | Field can be `null` |
| `.default(v)` | `.default(20)` | Default value if omitted |

---

## Error Code Reference

Common Zod error codes:

| Code | Cause | Example |
|------|-------|---------|
| `invalid_type` | Wrong type | `"abc"` for `z.number()` |
| `too_small` | Value below minimum | `limit: 0` for `z.number().min(1)` |
| `too_big` | Value above maximum | `offset: 999` for `z.number().max(100)` |
| `invalid_string` | String format invalid | `"not-an-email"` for `z.string().email()` |
| `invalid_email` | Email format invalid | Same as above |
| `invalid_url` | URL format invalid | `"not a url"` for `z.string().url()` |
| `invalid_enum_value` | Not in allowed values | `status: "unknown"` for `z.enum([...])` |
| `invalid_date` | Invalid date | `"2024-99-99"` for `z.date()` |
| `custom` | Custom validation failed | Via `.refine()` |

---

## Testing All Schemas

### Quick Test Checklist

```bash
# 1. Test query parameter limits
curl "http://localhost:3000/raffles?limit=999"  # Should fail
curl "http://localhost:3000/raffles?limit=50"   # Should pass

# 2. Test required fields
curl -X POST http://localhost:3000/auth/verify \
  -H "Content-Type: application/json" \
  -d '{}'  # Missing all fields

# 3. Test type coercion
curl "http://localhost:3000/raffles?limit=50&offset=abc"  # offset coercion

# 4. Test enum validation
curl "http://localhost:3000/leaderboard?by=invalid"  # Should fail

# 5. Test email validation
curl -X POST http://localhost:3000/support \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John",
    "email": "not-an-email",
    "subject": "Hello",
    "message": "Test message"
  }'
```

---

## Adding New Schemas

When adding a new endpoint, follow this template:

```typescript
// 1. Define schema
export const MyFeatureSchema = z.object({
  field1: z.string().min(1, 'Field1 is required'),
  field2: z.number().int().min(0),
  field3: z.enum(['a', 'b', 'c']).optional(),
});

// 2. Export type
export type MyFeatureDto = z.infer<typeof MyFeatureSchema>;

// 3. Use in controller
@Post()
@UsePipes(new (createZodPipe(MyFeatureSchema))())
async create(@Body() payload: MyFeatureDto) {
  // ✅ payload is guaranteed valid
  return this.service.create(payload);
}
```

---

## Related Documentation

- [VALIDATION_GUIDE.md](./VALIDATION_GUIDE.md) — Quick start guide
- [VALIDATION_IMPLEMENTATION.md](./VALIDATION_IMPLEMENTATION.md) — Detailed reference
- [ARCHITECTURE.md](../docs/ARCHITECTURE.md) — System architecture overview
