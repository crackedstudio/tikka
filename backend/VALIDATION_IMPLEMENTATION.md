# Zod Validation Implementation Reference

> Comprehensive guide to implementing and extending Zod validation in the Tikka backend.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Validation Pipe](#validation-pipe)
3. [Schema Definition](#schema-definition)
4. [Controller Integration](#controller-integration)
5. [Consistent Error Responses](#consistent-error-responses)
6. [Testing](#testing)
7. [Advanced Patterns](#advanced-patterns)
8. [Migration Guide](#migration-guide)

---

## Architecture

### Data Flow

```
HTTP Request
    ↓
Fastify Route Handler
    ↓
@UsePipes(createZodPipe(MySchema))
    ↓
Zod safeParse(value)
    ↓
    ├─→ ✅ Valid → Transform → Controller Method
    └─→ ❌ Invalid → BadRequestException
                        ↓
                    Error Interceptor → JSON Response (400)
```

### Components

| Layer | File | Purpose |
|-------|------|---------|
| **Pipe** | `src/api/rest/raffles/pipes/zod-validation.pipe.ts` | Validates and transforms incoming data |
| **Schemas** | `src/api/rest/*/\*.schema.ts` | Define Zod schemas for DTOs |
| **Error Types** | `src/common/validation.types.ts` | TypeScript interfaces for error responses |

---

## Validation Pipe

### Location

```
src/api/rest/raffles/pipes/zod-validation.pipe.ts
```

### Implementation

```typescript
export function createZodPipe<T>(schema: ZodSchema<T>) {
  return class implements PipeTransform {
    transform(value: unknown, _metadata: ArgumentMetadata): T {
      const result = schema.safeParse(value);
      if (!result.success) {
        const msg = result.error.errors.map((e) => e.message).join("; ");
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

### How It Works

1. **safeParse()** — Zod safely validates input without throwing (returns `{ success, data | error }`)
2. **Check Success** — If validation passes, return transformed data
3. **Build Error** — If validation fails, throw `BadRequestException` with:
   - `message: string` — Concatenated error messages
   - `errors: ZodIssue[]` — Detailed error array with `code`, `path`, `message`

### Error Response Format

When validation fails, NestJS's error interceptor formats it as:

```json
{
  "statusCode": 400,
  "message": "String must contain at most 255 characters; Invalid email",
  "errors": [
    {
      "code": "too_big",
      "path": ["username"],
      "message": "String must contain at most 255 characters",
      "maximum": 255,
      "type": "string",
      "inclusive": true
    },
    {
      "code": "invalid_email",
      "path": ["email"],
      "message": "Invalid email"
    }
  ]
}
```

---

## Schema Definition

### Location & Naming

- **Collocate with Controllers:** Define schemas in the same module as the controller
- **File Naming:** `{feature}.schema.ts` (e.g., `auth.schema.ts`, `raffles.schema.ts`)
- **Organization:** If multiple, create `dto/` directory

### Basic Structure

```typescript
import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// Query Parameters Schema
// ──────────────────────────────────────────────────────────────

export const ListRafflesQuerySchema = z.object({
  status: z.string().optional(),
  category: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
});

// Infer TypeScript type for use in controllers
export type ListRafflesQueryDto = z.infer<typeof ListRafflesQuerySchema>;

// ──────────────────────────────────────────────────────────────
// Request Body Schema
// ──────────────────────────────────────────────────────────────

export const UpsertMetadataSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(255, 'Title must be at most 255 characters')
    .optional(),

  description: z
    .string()
    .trim()
    .max(5000, 'Description must be at most 5000 characters')
    .optional(),

  image_url: z
    .string()
    .url('Invalid image URL')
    .nullable()
    .optional(),

  image_urls: z
    .array(z.string().url('Invalid image URL'))
    .nullable()
    .optional(),

  category: z
    .string()
    .max(50, 'Category must be at most 50 characters')
    .nullable()
    .optional(),

  metadata_cid: z
    .string()
    .regex(/^Qm[a-zA-Z0-9]{44}$/, 'Invalid IPFS CID')
    .nullable()
    .optional(),
});

export type UpsertMetadataDto = z.infer<typeof UpsertMetadataSchema>;
```

### Type Conversion: `z.coerce`

For query parameters, numbers come as strings. Use `z.coerce` to auto-convert:

```typescript
z.coerce.number().int().min(1).max(100).default(20)
```

**Converts:** `?limit=50` → `{ limit: 50 }` (number)
**Converts:** `?limit=invalid` → `{ limit: 20 }` (default applied)
**Converts:** `?limit=-5` → ValidationError (after coercion, validation fails)

### Common Validators

| Validator | Example | Notes |
|-----------|---------|-------|
| `.string()` | `z.string().min(1)` | Required non-empty string |
| `.string().optional()` | `z.string().optional()` | Optional field |
| `.number()` | `z.number().int().max(100)` | Integer validator |
| `.coerce.number()` | `z.coerce.number()` | Auto-convert string to number |
| `.boolean()` | `z.boolean()` | Boolean validator |
| `.date()` | `z.date()` | ISO date or Date object |
| `.enum(['a', 'b'])` | `z.enum(['pending', 'done'])` | Fixed set of values |
| `.array(z.string())` | `z.array(z.string().email())` | Array of type |
| `.nullable()` | `z.string().nullable()` | Explicitly allows `null` |
| `.url()` | `z.string().url()` | URL format validation |
| `.email()` | `z.string().email()` | Email format validation |
| `.datetime()` | `z.string().datetime()` | ISO 8601 datetime |
| `.regex(/pattern/)` | `z.string().regex(/^\w+$/)` | Regex pattern matching |
| `.refine()` | `.refine(v => v.length > 5)` | Custom validation logic |

### Error Messages

```typescript
export const AuthSchema = z.object({
  address: z
    .string({ required_error: 'Stellar address is required' })
    .min(1, { message: 'Address cannot be empty' })
    .min(56, { message: 'Invalid Stellar address format' }),

  password: z
    .string({ required_error: 'Password is required' })
    .min(8, { message: 'Password must be at least 8 characters' })
    .max(128, { message: 'Password must be at most 128 characters' }),
});
```

---

## Controller Integration

### Query Parameters Validation

```typescript
import { Controller, Get, Query, UsePipes } from '@nestjs/common';
import { createZodPipe } from './pipes/zod-validation.pipe';
import { ListRafflesQuerySchema, type ListRafflesQueryDto } from './raffles.schema';

@Controller('raffles')
export class RafflesController {
  @Get()
  @UsePipes(new (createZodPipe(ListRafflesQuerySchema))())
  async list(@Query() filters: ListRafflesQueryDto) {
    // ✅ filters.limit is always 1-100 (or default 20)
    // ✅ filters.offset is always >= 0 (or default 0)
    return this.rafflesService.list(filters);
  }
}
```

### Request Body Validation

```typescript
import { Body, Post, UsePipes } from '@nestjs/common';
import { createZodPipe } from './pipes/zod-validation.pipe';
import { UpsertMetadataSchema, type UpsertMetadataDto } from './raffles.schema';

@Post(':raffleId/metadata')
@UsePipes(new (createZodPipe(UpsertMetadataSchema))())
async upsertMetadata(
  @Param('raffleId', ParseIntPipe) raffleId: number,
  @Body() payload: UpsertMetadataDto,
) {
  // ✅ payload is guaranteed to match schema
  return this.rafflesService.upsertMetadata(raffleId, payload);
}
```

### Combined: Query + Body

```typescript
@Post('search')
@UsePipes(new (createZodPipe(SearchBodySchema))())
async search(
  @Query('category') category?: string, // Manual validation if needed
  @Body() payload: SearchBodyDto,
) {
  return this.searchService.search(category, payload);
}
```

---

## Consistent Error Responses

### Error Response Schema

All validation errors follow this shape:

```typescript
interface ValidationErrorResponse {
  statusCode: 400;
  message: string; // Concatenated error messages
  errors: Array<{
    code: string; // Zod error code
    path: (string | number)[]; // Field path
    message: string; // Human-readable error
    [key: string]: any; // Additional context
  }>;
}
```

### Example Responses

#### Invalid Query Parameter

**Request:** `GET /raffles?limit=abc&offset=-1`

**Response:**
```json
{
  "statusCode": 400,
  "message": "Expected number, received nan; Number must be greater than or equal to 0",
  "errors": [
    {
      "code": "invalid_type",
      "expected": "number",
      "received": "nan",
      "path": ["limit"],
      "message": "Expected number, received nan"
    },
    {
      "code": "too_small",
      "minimum": 0,
      "type": "number",
      "inclusive": true,
      "path": ["offset"],
      "message": "Number must be greater than or equal to 0"
    }
  ]
}
```

#### Missing Required Field

**Request:** `POST /auth/verify` with body `{ "address": "..." }`

**Response:**
```json
{
  "statusCode": 400,
  "message": "signature is required; nonce is required",
  "errors": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "undefined",
      "path": ["signature"],
      "message": "signature is required"
    },
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "undefined",
      "path": ["nonce"],
      "message": "nonce is required"
    }
  ]
}
```

#### Custom Validation Error

**Request:** `POST /support` with `{ "email": "invalid" }`

**Response:**
```json
{
  "statusCode": 400,
  "message": "Invalid email",
  "errors": [
    {
      "code": "invalid_email",
      "path": ["email"],
      "message": "Invalid email"
    }
  ]
}
```

---

## Testing

### Unit Test Example

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { RafflesController } from './raffles.controller';
import { RafflesService } from './raffles.service';
import { createZodPipe } from './pipes/zod-validation.pipe';
import { ListRafflesQuerySchema } from './raffles.schema';
import { BadRequestException } from '@nestjs/common';

describe('RafflesController Validation', () => {
  let controller: RafflesController;
  let service: RafflesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RafflesController],
      providers: [
        {
          provide: RafflesService,
          useValue: {
            list: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    controller = module.get<RafflesController>(RafflesController);
    service = module.get<RafflesService>(RafflesService);
  });

  describe('list', () => {
    it('should accept valid query params', async () => {
      await controller.list({ limit: 20, offset: 0 });
      expect(service.list).toHaveBeenCalledWith({ limit: 20, offset: 0 });
    });

    it('should reject invalid limit (too large)', () => {
      const pipe = new (createZodPipe(ListRafflesQuerySchema))();
      expect(() => pipe.transform({ limit: 200, offset: 0 })).toThrow(
        BadRequestException,
      );
    });

    it('should reject invalid offset (negative)', () => {
      const pipe = new (createZodPipe(ListRafflesQuerySchema))();
      expect(() => pipe.transform({ limit: 20, offset: -1 })).toThrow(
        BadRequestException,
      );
    });

    it('should apply defaults', () => {
      const pipe = new (createZodPipe(ListRafflesQuerySchema))();
      const result = pipe.transform({});
      expect(result).toEqual({ limit: 20, offset: 0 });
    });

    it('should coerce numeric strings', () => {
      const pipe = new (createZodPipe(ListRafflesQuerySchema))();
      const result = pipe.transform({ limit: '50', offset: '10' });
      expect(result).toEqual({ limit: 50, offset: 10 });
    });
  });
});
```

### E2E Test Example

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { RafflesModule } from './raffles.module';

describe('RafflesController (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [RafflesModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /raffles', () => {
    it('should return 400 with invalid limit', () => {
      return request(app.getHttpServer())
        .get('/raffles?limit=999')
        .expect(400)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
          expect(res.body).toHaveProperty('errors');
          expect(res.body.errors[0].code).toBe('too_big');
        });
    });

    it('should return 200 with valid params', () => {
      return request(app.getHttpServer())
        .get('/raffles?limit=10&offset=5')
        .expect(200);
    });
  });
});
```

---

## Advanced Patterns

### Discriminated Union (Polymorphic Payloads)

```typescript
export const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('email'),
    email: z.string().email(),
  }),
  z.object({
    type: z.literal('sms'),
    phone: z.string().regex(/^\+\d{1,15}$/),
  }),
  z.object({
    type: z.literal('push'),
    deviceId: z.string().uuid(),
  }),
]);

export type ActionDto = z.infer<typeof ActionSchema>;
```

### Conditional Validation

```typescript
export const RaffleSchema = z.object({
  title: z.string().min(1),
  isPrivate: z.boolean(),
  password: z.string().optional(),
}).refine(
  (data) => !data.isPrivate || data.password,
  {
    message: 'Password is required for private raffles',
    path: ['password'], // Show error on password field
  }
);
```

### Pre-Processing (Transform Before Validation)

```typescript
export const EmailSchema = z.object({
  email: z
    .string()
    .trim() // Remove whitespace
    .toLowerCase() // Normalize case
    .email(),
});

// Input: { email: "  User@Example.COM  " }
// After transform: { email: "user@example.com" }
```

### Array with Unique Items

```typescript
export const CustomersSchema = z.object({
  emails: z
    .array(z.string().email())
    .refine((items) => new Set(items).size === items.length, {
      message: 'Emails must be unique',
    }),
});
```

### Async Validation

```typescript
export const UsernameSchema = z.object({
  username: z
    .string()
    .min(3)
    .refine(
      async (val) => {
        // Check if username exists in database
        const exists = await db.users.findOne({ username: val });
        return !exists;
      },
      { message: 'Username already taken' }
    ),
});

// Note: Use `parseAsync()` instead of `safeParse()` in pipe
```

---

## Migration Guide

### From `class-validator` to Zod

#### Before (class-validator)

```typescript
export class ListQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}

@Get()
@UsePipes(new ValidationPipe({ transform: true }))
async list(@Query() query: ListQueryDto) { ... }
```

#### After (Zod)

```typescript
export const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
});

export type ListQueryDto = z.infer<typeof ListQuerySchema>;

@Get()
@UsePipes(new (createZodPipe(ListQuerySchema))())
async list(@Query() query: ListQueryDto) { ... }
```

### Benefits

✅ **Single Source of Truth** — Schemas define validation + types  
✅ **Runtime Safety** — Zod validates at runtime (not just compile-time)  
✅ **Better Error Messages** — Customizable error messages  
✅ **Transform Chain** — `.trim()`, `.toLowerCase()`, etc. in one place  
✅ **Smaller Bundle** — Zod is lighter than class-validator + class-transformer  

---

## File Structure

```
backend/src/
├── api/rest/
│   ├── raffles/
│   │   ├── raffles.controller.ts      ← Controllers
│   │   ├── raffles.schema.ts          ← Zod schemas
│   │   ├── metadata.schema.ts         ← Other endpoint schemas
│   │   ├── dto/
│   │   │   └── list-raffles-query.dto.ts
│   │   ├── pipes/
│   │   │   └── zod-validation.pipe.ts ← Shared validation pipe
│   │   └── raffles.service.ts
│   │
│   ├── auth/
│   │   ├── auth.controller.ts
│   │   ├── auth.schema.ts             ← Auth schemas
│   │   └── auth.service.ts
│   │
│   ├── users/
│   │   ├── users.schema.ts
│   │   └── dto/
│   │
│   └── ... other modules ...
│
└── common/
    └── validation.types.ts             ← Error types
```

---

## Checklist for New Endpoints

When adding a new endpoint, follow this checklist:

- [ ] Create `module.schema.ts` with Zod schemas for all inputs
- [ ] Use `z.infer<typeof Schema>` to generate DTO types
- [ ] Apply `@UsePipes(new (createZodPipe(Schema))())` to controller method
- [ ] Test with invalid inputs to ensure proper error responses
- [ ] Document custom validation logic in schema comments
- [ ] Add Swagger decorators if using OpenAPI docs
- [ ] Write unit and E2E tests for validation

---

## See Also

- [VALIDATION_GUIDE.md](./VALIDATION_GUIDE.md) — Quick reference
- [Zod Docs](https://zod.dev)
- [NestJS Pipes](https://docs.nestjs.com/pipes)
