# Validation Quick Reference Card

> Keep this handy when adding validation to new endpoints.

---

## Copy-Paste Template

### 1. Create Schema File

```typescript
// src/api/rest/my-module/my-module.schema.ts

import { z } from 'zod';

export const MyActionSchema = z.object({
  // Required string
  name: z.string({ required_error: 'Name is required' }).min(1),

  // Optional email
  email: z.string().email().optional(),

  // Optional enum
  status: z.enum(['active', 'inactive']).optional(),

  // Required number (for query params, use z.coerce.number())
  id: z.number().int().positive('ID must be positive'),

  // Optional with default
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),

  // Optional array
  tags: z.array(z.string()).optional(),

  // Optional nullable
  imageUrl: z.string().url().nullable().optional(),
});

export type MyActionDto = z.infer<typeof MyActionSchema>;
```

### 2. Add to Controller

```typescript
// src/api/rest/my-module/my-module.controller.ts

import { Controller, Post, Body, Query, UsePipes } from '@nestjs/common';
import { createZodPipe } from '../raffles/pipes/zod-validation.pipe';
import { MyActionSchema, type MyActionDto } from './my-module.schema';

@Controller('my-module')
export class MyModuleController {
  // Query validation
  @Get()
  @UsePipes(new (createZodPipe(MyActionSchema))())
  async list(@Query() query: MyActionDto) {
    return this.service.list(query);
  }

  // Body validation
  @Post()
  @UsePipes(new (createZodPipe(MyActionSchema))())
  async create(@Body() payload: MyActionDto) {
    return this.service.create(payload);
  }
}
```

### 3. Test It

```bash
# Valid request
curl -X POST http://localhost:3000/my-module \
  -H "Content-Type: application/json" \
  -d '{"name": "test", "id": 1}'

# Invalid request (will return 400)
curl -X POST http://localhost:3000/my-module \
  -H "Content-Type: application/json" \
  -d '{"name": "", "id": -1}'
```

---

## Common Validators

```typescript
// ─────────────────────────────────────────────────────────────
// STRINGS
// ─────────────────────────────────────────────────────────────
z.string()                    // Required string
z.string().optional()         // Optional string
z.string().min(1, 'Msg')      // With minimum length
z.string().max(255)           // With maximum length
z.string().trim()             // Trim whitespace
z.string().email()            // Email validation
z.string().url()              // URL validation
z.string().regex(/pattern/)   // Regex validation

// ─────────────────────────────────────────────────────────────
// NUMBERS (for JSON bodies)
// ─────────────────────────────────────────────────────────────
z.number()                    // Required number
z.number().int()              // Integer only
z.number().min(1)             // Minimum value
z.number().max(100)           // Maximum value
z.number().positive()         // Must be > 0

// ─────────────────────────────────────────────────────────────
// NUMBERS (for query params - always strings in URL)
// ─────────────────────────────────────────────────────────────
z.coerce.number().int().min(1).max(100)
// Usage: ?limit=50 → converts string "50" to number 50

// ─────────────────────────────────────────────────────────────
// ENUMS (fixed set of allowed values)
// ─────────────────────────────────────────────────────────────
z.enum(['pending', 'active', 'done'])
z.enum(['email', 'sms']).optional()

// ─────────────────────────────────────────────────────────────
// DATES
// ─────────────────────────────────────────────────────────────
z.date()                      // Date object
z.string().datetime()         // ISO 8601 datetime string
z.string().datetime()         // For ?from=2024-01-01T...

// ─────────────────────────────────────────────────────────────
// ARRAYS
// ─────────────────────────────────────────────────────────────
z.array(z.string())           // Array of strings
z.array(z.number())           // Array of numbers
z.array(z.string().email())   // Array of emails

// ─────────────────────────────────────────────────────────────
// NULLABLE / OPTIONAL
// ─────────────────────────────────────────────────────────────
z.string().optional()         // Field can be omitted
z.string().nullable()         // Field can be null
z.string().default('value')   // Use 'value' if omitted
z.string().optional().default('value')  // Both optional + default
```

---

## Error Response Format

All validation errors return this shape:

```json
{
  "statusCode": 400,
  "message": "Name is required; ID must be positive",
  "errors": [
    {
      "code": "invalid_type",
      "path": ["name"],
      "message": "Name is required"
    },
    {
      "code": "too_small",
      "path": ["id"],
      "message": "ID must be positive"
    }
  ]
}
```

---

## Validation Error Codes

When validation fails, Zod reports these error codes:

| Code | Cause | Fix |
|------|-------|-----|
| `invalid_type` | Wrong data type | Check type: string, number, etc. |
| `too_small` | Below min value/length | Increase value or string length |
| `too_big` | Above max value/length | Decrease value or string length |
| `invalid_string` | String format invalid | Check for email, URL, regex patterns |
| `invalid_enum_value` | Not in allowed set | Use one of the enum values |
| `invalid_email` | Email format invalid | Use valid email format |
| `invalid_url` | URL format invalid | Use valid URL format |
| `invalid_date` | Invalid date | Use ISO 8601 format |

---

## Do's and Don'ts

### ✅ DO

```typescript
// ✅ Use z.infer for DTO types
export type MyDto = z.infer<typeof MySchema>;

// ✅ Use z.coerce for numeric query params
z.coerce.number().min(1).max(100)

// ✅ Provide custom error messages
z.string().min(1, 'Field is required')

// ✅ Use @UsePipes with new instance
@UsePipes(new (createZodPipe(MySchema))())

// ✅ Trim strings to avoid whitespace issues
z.string().trim().min(1)

// ✅ Test both valid and invalid inputs
```

### ❌ DON'T

```typescript
// ❌ Don't manually define DTO class if using Zod
export class MyDto { ... }  // Use z.infer instead

// ❌ Don't forget @UsePipes
@Get()  // Missing validation!
async list() { ... }

// ❌ Don't use z.number() for query params
z.number().min(1)  // Use z.coerce.number() instead

// ❌ Don't forget to export the schema
const MySchema = z.object(...);  // Export it!

// ❌ Don't put validation logic in controller
@Get()
async list(@Query() query: any) {
  if (!query.limit) { ... }  // Wrong place for validation!
}

// ❌ Don't use old class-validator decorators with Zod
@IsInt()  // Remove these!
@Min(1)
z.number().int().min(1)  // Use Zod instead
```

---

## Quick Decision Tree

```
Is this a query parameter?
├─ Number? Use z.coerce.number()
├─ Enum? Use z.enum(['a', 'b'])
├─ Datetime? Use z.string().datetime()
└─ String? Use z.string().min(1)

Is this required or optional?
├─ Can be omitted? Add .optional()
├─ Can be null? Add .nullable()
├─ Should default? Add .default(value)
└─ Always required? Don't add anything

Any format validation?
├─ Email? Add .email()
├─ URL? Add .url()
├─ Pattern? Add .regex(/pattern/)
└─ None? Just .min() and .max()
```

---

## One-Liners

```typescript
// String with constraints
z.string().trim().min(1, 'Required').max(255, 'Too long')

// Number within range
z.number().int().min(0).max(100)

// Query param number (auto-coerce from string)
z.coerce.number().int().min(1).max(100).default(20).optional()

// Enum with optional default
z.enum(['a', 'b', 'c']).default('a').optional()

// Email - required in body, optional in query
z.string().email('Valid email required')
z.string().email().optional()

// Array of something
z.array(z.string().email()).optional()

// DateTime string (ISO format)
z.string().datetime("Invalid datetime. Use ISO 8601")

// URL or null
z.string().url().nullable().optional()
```

---

## Testing Checklist

Before submitting your code:

- [ ] Valid request returns 200
- [ ] Missing required field returns 400
- [ ] Invalid type returns 400 (e.g., string for number)
- [ ] Out-of-range value returns 400 (e.g., limit=999)
- [ ] Invalid enum returns 400 (e.g., status=invalid)
- [ ] Invalid format returns 400 (e.g., email=notanemail)
- [ ] Error response includes `statusCode: 400`
- [ ] Error response includes `message` string
- [ ] Error response includes `errors` array with details

---

## Files to Keep Handy

| File | Use For |
|------|---------|
| `VALIDATION_GUIDE.md` | Quick reference (5 min) |
| `VALIDATION_IMPLEMENTATION.md` | Deep dive & patterns (20 min) |
| `VALIDATION_SCHEMAS.md` | Look up existing schemas |
| `zod/docs` | Zod-specific questions |

---

## Common Mistakes & Fixes

### ❌ Query param validation fails silently
```typescript
// ❌ Wrong
z.number().min(1)  // String "50" won't validate

// ✅ Right
z.coerce.number().min(1)  // Converts "50" to 50
```

### ❌ Type mismatch
```typescript
// ❌ Wrong
export class MyDto { /* ... */ }
async create(@Body() payload: MyDto)

// ✅ Right
export type MyDto = z.infer<typeof MySchema>;
async create(@Body() payload: MyDto)
```

### ❌ Optional with default confusion
```typescript
// ❌ Query param defaults don't work
z.string().default('value')  // Query params are always strings!

// ✅ Right
z.coerce.number().default(20)  // Applies default if missing
```

---

## Help & References

- **How do I...** → See `VALIDATION_IMPLEMENTATION.md`
- **What's the pattern for...** → See `VALIDATION_SCHEMAS.md` modules
- **I got error code X** → See `VALIDATION_SCHEMAS.md` error codes
- **Show me an example** → Search `VALIDATION_GUIDE.md` patterns
- **I'm stuck** → Read `VALIDATION_SUMMARY.md` troubleshooting

---

**Remember:** Zod schemas are your **single source of truth** for validation + types. Keep them close to controllers, test them well, and document complex logic.
