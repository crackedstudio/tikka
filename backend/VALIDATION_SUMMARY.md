# Request Validation Implementation Summary

> Complete request validation using Zod is now implemented across the entire Tikka backend. All endpoints validate incoming data and return consistent 400 error responses.

---

## What Was Done

### 1. ✅ Converted Monitor DTOs to Zod

**Location:** `src/api/rest/monitor/dto/`

All monitor module query DTOs have been converted from `class-validator` (decorator-based) to Zod schemas:

- `jobs-query.dto.ts` — Job status filtering with pagination
- `latency-query.dto.ts` — ISO 8601 datetime range validation
- `errors-query.dto.ts` — Error log pagination

**Benefits:**
- Unified validation approach across all modules
- Type inference via `z.infer<typeof Schema>`
- Better error messages
- Single source of truth (schema = validation + types)

### 2. ✅ Applied Validation Pipes to Monitor Controller

**Location:** `src/api/rest/monitor/monitor.controller.ts`

All query-based endpoints now use validation pipes:

```typescript
@Get('jobs')
@UsePipes(new (createZodPipe(JobsQuerySchema))())
async getJobs(@Query() query: JobsQueryDto) { ... }
```

Endpoints protected:
- `GET /monitor/jobs` — Job status/limit/cursor
- `GET /monitor/latency` — Date range queries
- `GET /monitor/errors` — Error pagination

### 3. ✅ Enhanced Validation Pipe

**Location:** `src/api/rest/raffles/pipes/zod-validation.pipe.ts`

Improved implementation with:
- Better JSDoc documentation
- Helper function `formatZodError()` for debugging
- Consistent error response format
- Support for all Zod features (transforms, refinements, etc.)

### 4. ✅ Created Error Type Definitions

**Location:** `src/common/validation.types.ts`

New shared types for validation errors:
- `ValidationErrorResponse` — Standard error shape
- `extractZodErrorMessages()` — Utility for logging
- `buildValidationErrorResponse()` — Error response builder

### 5. ✅ Comprehensive Documentation

Three detailed guides created:

#### VALIDATION_GUIDE.md (Quick Reference)
- Overview of validation approach
- Quick start for adding validation
- Common patterns
- Full endpoint checklist
- Error response examples

#### VALIDATION_IMPLEMENTATION.md (Detailed Reference)
- Architecture overview
- Validation pipe implementation
- Schema definition patterns
- Controller integration
- Consistent error responses
- Advanced patterns (discriminated unions, conditionals)
- Migration guide from class-validator
- Complete file structure
- Testing examples
- New endpoint checklist

#### VALIDATION_SCHEMAS.md (Complete Inventory)
- Quick index of all schemas
- Module-by-module breakdown
- Validation rules summary
- Error code reference
- Testing checklist
- Template for adding new schemas

---

## Validation Coverage

### All Endpoints Protected ✅

| Module | Count | Status |
|--------|-------|--------|
| **Auth** | 2 endpoints | ✅ Fully validated |
| **Raffles** | 2 endpoints | ✅ Fully validated |
| **Notifications** | 1 endpoint | ✅ Fully validated |
| **Users** | 1 endpoint | ✅ Fully validated |
| **Leaderboard** | 1 endpoint | ✅ Fully validated |
| **Search** | 1 endpoint | ✅ Fully validated |
| **Support** | 1 endpoint | ✅ Fully validated |
| **Monitor** | 3 endpoints | ✅ Fully validated (NEW) |
| **Stats** | 1 endpoint | ✅ No input validation needed |
| **TOTAL** | 13 endpoints | ✅ 12/13 validated |

### Validation Types

✅ **Query Parameters** — All endpoints with `?param=value`  
✅ **Request Bodies** — All POST/PUT endpoints  
✅ **Path Parameters** — Using `ParseIntPipe` for numeric IDs  
✅ **File Uploads** — Size and type validation  

---

## Error Response Format

All validation errors return **consistent 400 responses**:

```json
{
  "statusCode": 400,
  "message": "error message 1; error message 2",
  "errors": [
    {
      "code": "too_big",
      "path": ["limit"],
      "message": "Number must be less than or equal to 100",
      "maximum": 100,
      "type": "number",
      "inclusive": true
    },
    {
      "code": "invalid_type",
      "path": ["offset"],
      "message": "Expected number, received undefined",
      "expected": "number",
      "received": "undefined"
    }
  ]
}
```

### Error Codes

Standard Zod error codes used across all validators:
- `invalid_type` — Wrong data type
- `too_small` — Below minimum value/length
- `too_big` — Above maximum value/length
- `invalid_string` — String format invalid
- `invalid_enum_value` — Not in allowed enum
- `custom` — Custom validation failed

---

## Implementation Quick Start

### For Adding New Validation

1. **Create Schema**
```typescript
// raffles/raffles.schema.ts
export const CreateRaffleSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  endTime: z.number().int().positive('End time must be in the future'),
});
```

2. **Apply Pipe**
```typescript
// raffles/raffles.controller.ts
@Post()
@UsePipes(new (createZodPipe(CreateRaffleSchema))())
async create(@Body() payload: z.infer<typeof CreateRaffleSchema>) {
  return this.rafflesService.create(payload);
}
```

3. **Test**
```bash
curl -X POST http://localhost:3000/raffles \
  -H "Content-Type: application/json" \
  -d '{"title": "", "endTime": -1}'
# Returns 400 with validation errors
```

---

## File Changes

### Modified Files

| File | Changes |
|------|---------|
| `src/api/rest/monitor/dto/jobs-query.dto.ts` | Converted to Zod + type inference |
| `src/api/rest/monitor/dto/latency-query.dto.ts` | Converted to Zod + datetime validation |
| `src/api/rest/monitor/dto/errors-query.dto.ts` | Converted to Zod + type inference |
| `src/api/rest/monitor/monitor.controller.ts` | Added `@UsePipes()` for all endpoints |
| `src/api/rest/raffles/pipes/zod-validation.pipe.ts` | Enhanced docs + helper function |

### New Files

| File | Purpose |
|------|---------|
| `src/common/validation.types.ts` | Error response type definitions + utilities |
| `backend/VALIDATION_GUIDE.md` | Quick reference guide |
| `backend/VALIDATION_IMPLEMENTATION.md` | Detailed reference manual |
| `backend/VALIDATION_SCHEMAS.md` | Complete schema inventory |

---

## Testing the Implementation

### Unit Test Example
```typescript
import { createZodPipe } from './zod-validation.pipe';
import { ListRafflesQuerySchema } from './raffles.schema';
import { BadRequestException } from '@nestjs/common';

const pipe = new (createZodPipe(ListRafflesQuerySchema))();

// ✅ Valid input
pipe.transform({ limit: 50, offset: 10 }); // Works

// ❌ Invalid input
pipe.transform({ limit: 999 }); // Throws BadRequestException
```

### E2E Test Example
```bash
# ✅ Valid request
curl "http://localhost:3000/raffles?limit=50&offset=0"
# Returns 200 with raffles list

# ❌ Invalid request
curl "http://localhost:3000/raffles?limit=999"
# Returns 400 with validation error
```

---

## Validation Configuration

### Environment Variables (if needed)

For dynamic validation rules, add to `.env`:

```bash
# Max file upload size (bytes)
UPLOAD_MAX_BYTES=5242880  # 5MB

# Pagination limits
PAGINATION_MAX_LIMIT=100
PAGINATION_MAX_OFFSET=999999

# String length limits
TITLE_MAX_LENGTH=255
DESCRIPTION_MAX_LENGTH=5000
```

Update schemas to use:
```typescript
export const MySchema = z.object({
  title: z.string().max(
    parseInt(process.env.TITLE_MAX_LENGTH || '255')
  ),
});
```

---

## Validation Features Supported

✅ **Coercion** — `z.coerce.number()` auto-converts string to number  
✅ **Defaults** — `.default(value)` when field is omitted  
✅ **Transforms** — `.transform(fn)` modifies value before validation  
✅ **Custom Validation** — `.refine(fn)` for custom logic  
✅ **Typed Inference** — `z.infer<typeof Schema>` auto-generates types  
✅ **Nullable/Optional** — `.nullable()`, `.optional()` for flexible fields  
✅ **Enums** — `z.enum([...])` for fixed value sets  
✅ **Arrays** — `z.array(...)` for array validation  
✅ **Discriminated Unions** — `.discriminatedUnion()` for polymorphic payloads  

---

## Best Practices Applied

✅ **Single Source of Truth** — Schemas define validation + TypeScript types  
✅ **Consistent Errors** — All endpoints return same error format  
✅ **Fail-Fast** — Invalid input rejected immediately, before controller logic  
✅ **Clear Messages** — Human-readable error messages for each field  
✅ **Type Safety** — Full TypeScript type inference from schemas  
✅ **Minimal Dependencies** — Uses only Zod (already in package.json)  
✅ **DRY Principle** — Pipe reused across all endpoints  

---

## Migration Path

If using `class-validator` elsewhere (outside these modules), migrate to Zod:

### Pattern (Before → After)

```typescript
// ❌ BEFORE: class-validator
export class MyDto {
  @IsString()
  @MinLength(1)
  name: string;
  
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}

// ✅ AFTER: Zod
export const MySchema = z.object({
  name: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type MyDto = z.infer<typeof MySchema>;
```

---

## Troubleshooting

### "Validation not working on my endpoint"

**Check:**
1. Schema is exported from file
2. `@UsePipes(new (createZodPipe(MySchema))())` is applied
3. Controller method parameter type matches inferred DTO type
4. All required fields are in schema

### "Error response doesn't match expected format"

The validation pipe always returns:
```json
{
  "statusCode": 400,
  "message": "...",
  "errors": [...]
}
```

If you're seeing something different, check if:
- Validation error is being thrown correctly
- Error is not being caught/transformed elsewhere
- Global error interceptor is not overriding format

### "Type mismatch between schema and DTO"

Always use `z.infer<typeof Schema>`:
```typescript
export type MyDto = z.infer<typeof MySchema>;
```

Never manually define the DTO class if using Zod.

---

## Related Documentation

- **[ARCHITECTURE.md](../docs/ARCHITECTURE.md)** — System-wide architecture
- **[README.md](./README.md)** — Backend setup instructions
- **[Contributing Guide](../CONTRIBUTING.md)** — Development standards
- **[Zod Docs](https://zod.dev)** — Complete Zod reference

---

## Questions?

See the three validation guides:
1. **VALIDATION_GUIDE.md** — Quick start (5 min read)
2. **VALIDATION_IMPLEMENTATION.md** — Deep dive (20 min read)
3. **VALIDATION_SCHEMAS.md** — Complete inventory (reference)

Or check the inline code comments in:
- `src/api/rest/raffles/pipes/zod-validation.pipe.ts`
- `src/common/validation.types.ts`
- `src/auth/auth.schema.ts`
