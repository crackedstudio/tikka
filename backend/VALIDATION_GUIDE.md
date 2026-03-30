# Request Validation Guide

> **Goal:** All request bodies and query parameters are validated with Zod; invalid input is rejected with clear 400 responses.

---

## Overview

The backend uses **Zod** for runtime schema validation, integrated with NestJS via a custom validation pipe. All incoming data (body, query params) is validated before reaching controllers.

### Response Format on Validation Error

All validation errors return a **consistent shape**:

```json
{
  "statusCode": 400,
  "message": "error1; error2",
  "errors": [
    {
      "code": "invalid_type",
      "path": ["email"],
      "message": "Invalid email format"
    }
  ]
}
```

---

## Quick Start: Adding Validation

### 1. Define Zod Schema

Create a schema file (e.g., `module.schema.ts`):

```typescript
import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';

// ✅ Query params schema
export const ListRafflesQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListRafflesQueryDto = z.infer<typeof ListRafflesQuerySchema>;

// ✅ Request body schema
export const UpsertMetadataSchema = z.object({
  title: z.string().min(1, 'Title is required').optional(),
  description: z.string().optional(),
  image_url: z.string().url('Invalid image URL').nullable().optional(),
  category: z.string().nullable().optional(),
});

export type UpsertMetadataDto = z.infer<typeof UpsertMetadataSchema>;

// ✅ Optional: Swagger DTO for docs (parallelizes schema + docs)
export class UpsertMetadataSwaggerDto {
  @ApiProperty({ description: 'Raffle title' })
  title?: string;

  @ApiProperty({ description: 'Raffle description' })
  description?: string;

  // ... other fields
}
```

### 2. Apply Validation Pipe to Controllers

Use the `createZodPipe()` helper with `@UsePipes()`:

```typescript
import { Controller, Get, Post, Body, Query, UsePipes } from '@nestjs/common';
import { createZodPipe } from './pipes/zod-validation.pipe';
import {
  ListRafflesQuerySchema,
  ListRafflesQueryDto,
  UpsertMetadataSchema,
  UpsertMetadataDto,
} from './raffles.schema';

@Controller('raffles')
export class RafflesController {
  constructor(private rafflesService: RafflesService) {}

  // ✅ Query params validation
  @Get()
  @UsePipes(new (createZodPipe(ListRafflesQuerySchema))())
  async list(@Query() filters: ListRafflesQueryDto) {
    return this.rafflesService.list(filters);
  }

  // ✅ Request body validation
  @Post(':raffleId/metadata')
  @UsePipes(new (createZodPipe(UpsertMetadataSchema))())
  async upsertMetadata(
    @Param('raffleId', ParseIntPipe) raffleId: number,
    @Body() payload: UpsertMetadataDto,
  ) {
    return this.rafflesService.upsertMetadata(raffleId, payload);
  }
}
```

---

## Validation Pipe Implementation

**File:** `src/api/rest/raffles/pipes/zod-validation.pipe.ts`

```typescript
import {
  PipeTransform,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { ZodSchema } from 'zod';

/** Validates payload with a Zod schema; throws BadRequestException on failure. */
export function createZodPipe<T>(schema: ZodSchema<T>) {
  return class implements PipeTransform {
    transform(value: unknown, _metadata: ArgumentMetadata): T {
      const result = schema.safeParse(value);
      if (!result.success) {
        const msg = result.error.errors.map((e) => e.message).join('; ');
        throw new BadRequestException({
          message: msg,
          errors: result.error.errors,
        });
      }
      return result.data;
    }
  };
}
```

---

## Common Patterns

### Query Parameters with Coercion

```typescript
export const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
```

**Result:** `?limit=abc&offset=xyz` → `{ "limit": 20, "offset": 0 }` (coerced to defaults)

### Enums

```typescript
export const JobsQuerySchema = z.object({
  status: z.enum(['pending', 'completed', 'failed']).optional(),
});
```

### DateTime Validation

```typescript
export const LatencyQuerySchema = z.object({
  from: z.string().datetime("Invalid datetime format for 'from'").optional(),
  to: z.string().datetime("Invalid datetime format for 'to'").optional(),
});
```

### Nullable Fields

```typescript
export const MetadataSchema = z.object({
  image_url: z.string().url().nullable().optional(),
  image_urls: z.array(z.string().url()).nullable().optional(),
});
```

**Accepts:** `null`, missing, or valid URL strings.

### Custom Error Messages

```typescript
export const AuthSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email address')
    .min(5, 'Email must be at least 5 characters')
    .max(255, 'Email must be at most 255 characters'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters'),
});
```

---

## Endpoints Checklist

### Auth (`POST /auth/verify`, `GET /auth/nonce`)

✅ **Status:** Validated  
**Schemas:** `auth.schema.ts`
- `GetNonceQuerySchema` — query params with address validation
- `VerifyBodySchema` — request body with signature/nonce

### Raffles (`GET /raffles`, `POST /raffles/:raffleId/metadata`)

✅ **Status:** Validated  
**Schemas:** `raffles/dto/list-raffles-query.dto.ts`, `raffles/metadata.schema.ts`
- `ListRafflesQuerySchema` — pagination + filters
- `UpsertMetadataSchema` — raffle metadata fields

### Notifications (`POST /notifications/subscribe`)

✅ **Status:** Validated  
**Schemas:** `notifications/dto/subscribe.dto.ts`
- `SubscribeSchema` — raffleId + channel

### Users (`GET /users/:address/history`)

✅ **Status:** Validated  
**Schemas:** `users/dto/user-history-query.dto.ts`
- `UserHistoryQuerySchema` — pagination

### Leaderboard (`GET /leaderboard`)

✅ **Status:** Validated  
**Schemas:** `leaderboard/dto/leaderboard-query.dto.ts`
- `LeaderboardQuerySchema` — sort + limit

### Search (`GET /search`)

✅ **Status:** Validated  
**Schemas:** `search/dto/search-query.dto.ts`
- `SearchQuerySchema` — query string + pagination

### Support (`POST /support`)

✅ **Status:** Validated  
**Schemas:** `support/dto/support.dto.ts`
- `SupportSchema` — name, email, subject, message

### Monitor (`GET /monitor/jobs`, etc.)

✅ **Status:** Validated  
**Schemas:** `monitor/dto/*.ts` (jobs, latency, errors)
- All monitor endpoints now use Zod validation

---

## Error Response Examples

### Invalid Email Format

**Request:**
```
POST /auth/verify
{
  "address": "GI...",
  "signature": "sig",
  "nonce": "",
  "issuedAt": "invalid"
}
```

**Response:**
```json
{
  "statusCode": 400,
  "message": "nonce cannot be empty",
  "errors": [
    {
      "code": "too_small",
      "path": ["nonce"],
      "message": "nonce cannot be empty"
    }
  ]
}
```

### Query Parameter Out of Range

**Request:**
```
GET /raffles?limit=200&offset=-5
```

**Response:**
```json
{
  "statusCode": 400,
  "message": "Number must be less than or equal to 100; Number must be greater than or equal to 0",
  "errors": [
    {
      "code": "too_big",
      "path": ["limit"],
      "message": "Number must be less than or equal to 100"
    },
    {
      "code": "too_small",
      "path": ["offset"],
      "message": "Number must be greater than or equal to 0"
    }
  ]
}
```

---

## Testing Validation

### Example Test

```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { createZodPipe } from './zod-validation.pipe';
import { ListRafflesQuerySchema } from './raffles.schema';

describe('Zod Validation Pipe', () => {
  it('should throw BadRequestException on invalid input', () => {
    const pipe = new (createZodPipe(ListRafflesQuerySchema))();
    expect(() => pipe.transform({ limit: 'invalid' })).toThrow(
      BadRequestException,
    );
  });

  it('should coerce numeric strings', () => {
    const pipe = new (createZodPipe(ListRafflesQuerySchema))();
    const result = pipe.transform({ limit: '50', offset: '10' });
    expect(result).toEqual({ limit: 50, offset: 10 });
  });

  it('should apply defaults', () => {
    const pipe = new (createZodPipe(ListRafflesQuerySchema))();
    const result = pipe.transform({});
    expect(result).toEqual({ limit: 20, offset: 0 });
  });
});
```

---

## Best Practices

1. **Collocate Schemas:** Define schemas in the same module they're used (e.g., `raffles/raffles.schema.ts`).
2. **Type Inference:** Use `z.infer<typeof Schema>` for DTO types instead of class-based DTOs.
3. **Human-Readable Messages:** Always write clear error messages.
4. **Consistent Defaults:** Use `.default()` in schemas instead of controller logic.
5. **Swagger Docs:** If using Swagger, maintain parallel Swagger DTOs for documentation.

---

## Resources

- [Zod Documentation](https://zod.dev)
- [NestJS Pipes](https://docs.nestjs.com/pipes)
- [Validation Middleware](docs/ARCHITECTURE.md#validation-pipe)
