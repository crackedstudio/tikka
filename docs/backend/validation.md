# Backend Request Validation

> **Authority:** This document is the single source of truth for request validation in the Tikka backend. Historical notes from the former `VALIDATION_*.md` files live in [`docs/archive/backend-validation/`](../archive/backend-validation/).

---

## Overview

The backend validates **every controller input** using two complementary layers:

| Layer | Mechanism | Scope |
|-------|-----------|-------|
| **Global** | NestJS `ValidationPipe` in `src/main.ts` | All DTO classes decorated with `class-validator` |
| **Per-route** | Zod `createZodPipe()` via `@UsePipes()` | Schemas in `*.schema.ts` / shared DTO modules |

Both layers reject invalid input with **HTTP 400** and a structured error body.

### Global ValidationPipe

Registered in `src/main.ts`:

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,           // strip unknown properties
    forbidNonWhitelisted: true, // 400 if extra properties are sent
    transform: true,           // coerce query strings to DTO types
  }),
);
```

**Implications for clients:**

- Request bodies and query objects must match DTO fields exactly—no extra keys.
- Query parameters are coerced (e.g. `"20"` → `20` for numeric fields).
- Controllers that use **class-validator DTOs** (`@Body() dto: MyDto`) are validated automatically.
- Controllers that use **Zod pipes** keep their existing schema validation in addition to the global pipe (for DTO-typed params).

---

## Quick Start: Adding Validation

### Option A — class-validator DTO (preferred for new endpoints)

```typescript
// dto/create-widget.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min, Max } from 'class-validator';

export class CreateWidgetDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;
}

// widget.controller.ts
@Post()
async create(@Body() body: CreateWidgetDto) {
  return this.service.create(body);
}
```

### Option B — Zod schema (existing pattern)

```typescript
// widget.schema.ts
import { z } from 'zod';

export const CreateWidgetSchema = z.object({
  name: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(100),
});
export type CreateWidgetDto = z.infer<typeof CreateWidgetSchema>;

// widget.controller.ts
@Post()
@UsePipes(new (createZodPipe(CreateWidgetSchema))())
async create(@Body() body: CreateWidgetDto) {
  return this.service.create(body);
}
```

---

## Validation Pipeline

```
HTTP Request
    ↓
Fastify route
    ↓
Global ValidationPipe (class-validator DTOs on @Body/@Query)
    ↓
Route-level @UsePipes(createZodPipe(...))  [when present]
    ↓
Controller method
    ↓
Service layer
```

### Zod pipe implementation

Location: `src/api/rest/raffles/pipes/zod-validation.pipe.ts`

```typescript
export function createZodPipe<T>(schema: ZodSchema<T>) {
  return class implements PipeTransform {
    transform(value: unknown): T {
      const result = schema.safeParse(value);
      if (!result.success) {
        const msg = result.error.errors.map((e) => e.message).join('; ');
        throw new BadRequestException({ message: msg, errors: result.error.errors });
      }
      return result.data;
    }
  };
}
```

---

## Error Response Format

All validation failures return **400 Bad Request**:

```json
{
  "statusCode": 400,
  "message": "limit must not be greater than 100; offset must not be less than 0",
  "errors": [
    { "code": "too_big", "path": ["limit"], "message": "limit must not be greater than 100" }
  ]
}
```

Zod pipe errors include the raw Zod `errors` array. class-validator errors are formatted by Nest's `ValidationPipe`.

---

## Schema Inventory

| Module | Endpoint | Schema / DTO | Validator |
|--------|----------|--------------|-----------|
| Auth | `GET /auth/nonce` | `GetNonceQuerySchema` | Zod |
| Auth | `POST /auth/verify` | `VerifyBodySchema` | Zod |
| Auth | `POST /auth/refresh` | `RefreshBodySchema` | Zod |
| Auth | `POST /auth/sign-out` | `SignOutBodySchema` | Zod |
| Raffles | `GET /raffles` | `ListRafflesQueryDto` | class-validator + Zod schema |
| Raffles | `GET /raffles/:id/participants` | `ParticipantListQueryDto` | class-validator + Zod |
| Raffles | `POST /raffles/:id/metadata` | `UpsertMetadataSchema` | Zod |
| Raffles | `POST /raffles/:id/purchase` | `PurchaseTicketSchema` | Zod |
| Notifications | `POST /notifications/*` | `SubscribeDto`, etc. | class-validator |
| Users | `GET /users/:address/history` | `UserHistoryQueryDto` | class-validator |
| Leaderboard | `GET /leaderboard` | `LeaderboardQueryDto` | class-validator |
| Leaderboard | `POST /leaderboard/indexer-events` | `IndexerEventBodyDto` | class-validator |
| Search | `GET /search` | `SearchQueryDto` | class-validator |
| Support | `POST /support` | `SupportSchema` | Zod |
| Stats | `POST /stats/verify` | `VerifyDrawBodyDto` | class-validator |
| Stats | `GET /stats/verify` | `VerifyDrawQueryDto` | class-validator |
| Monitor | `GET /monitor/*` | `JobsQueryDto`, etc. | class-validator |
| Monitor | `POST /monitor/replay` | `ReplayJobConfigDto` | class-validator |
| Webhooks | `POST /webhooks` | `CreateWebhookDto` | class-validator |

See module `dto/` and `*.schema.ts` files for field-level rules.

---

## Common Patterns

### Query pagination

```typescript
limit: z.coerce.number().int().min(1).max(100).default(20)
offset: z.coerce.number().int().min(0).default(0)
```

### Optional nullable fields

```typescript
image_url: z.string().url().nullable().optional()
```

### Stellar addresses

Validated in auth/raffle schemas as non-empty strings; on-chain format checks happen in services.

### Multipart uploads

`POST /raffles/upload-image` validates MIME type via magic-byte detection (`detectFileTypeFromBuffer`) and `sharp` metadata—not via JSON DTOs.

---

## Testing

### Unit tests

- Mock services; send invalid payloads through controller methods or pipes.
- Assert `BadRequestException` / 400 status and error shape.

### Manual curl

```bash
# Valid
curl "http://localhost:3001/raffles?limit=20&offset=0"

# Invalid (limit > 100)
curl "http://localhost:3001/raffles?limit=200"
# → 400 with validation message

# forbidNonWhitelisted — extra field rejected
curl -X POST http://localhost:3001/stats/verify \
  -H "Content-Type: application/json" \
  -d '{"oracle_public_key":"0xabc","request_id":"r1","proof":"p1","seed":"s1","extra":true}'
# → 400 property extra should not exist
```

### Regenerate OpenAPI

After DTO changes:

```bash
cd backend && pnpm run generate:openapi
pnpm run validate:openapi
```

---

## Checklist for New Endpoints

- [ ] Define a DTO class with `class-validator` decorators **or** a Zod schema
- [ ] Apply `@Body()` / `@Query()` with the typed DTO (not raw `@Body('field')`)
- [ ] Add `@ApiProperty` / `@ApiPropertyOptional` for Swagger
- [ ] Confirm no extra client fields (global `forbidNonWhitelisted`)
- [ ] Add unit tests for at least one valid and one invalid case
- [ ] Run `pnpm run generate:openapi` and commit updated `openapi.json`

---

## File Layout

```
backend/src/
├── main.ts                          # Global ValidationPipe
├── api/rest/
│   ├── raffles/
│   │   ├── pipes/zod-validation.pipe.ts
│   │   ├── dto/                       # class-validator DTOs
│   │   └── metadata.schema.ts       # Zod schemas
│   ├── stats/dto/verify-draw.dto.ts
│   ├── monitor/dto/
│   └── …
├── auth/auth.schema.ts              # Zod auth schemas
└── common/validation.types.ts       # Shared error types
```

---

## Further Reading

- Archived originals: [`docs/archive/backend-validation/`](../archive/backend-validation/)
- OpenAPI spec: [`backend/openapi.json`](../../backend/openapi.json)
- Environment validation (separate concern): `src/config/env.schema.ts`
