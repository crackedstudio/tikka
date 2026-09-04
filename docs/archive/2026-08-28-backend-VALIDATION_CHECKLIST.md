# Zod Validation Setup Checklist

> Verification checklist to ensure Zod request validation is properly implemented.

---

## ✅ Implementation Complete

### Core Setup
- [x] Zod is already installed in `package.json` (v3.23.0)
- [x] Custom validation pipe created: `src/api/rest/raffles/pipes/zod-validation.pipe.ts`
- [x] Error response types defined: `src/common/validation.types.ts`

### Controllers & Schemas
- [x] **Auth Module** — Schemas & validation pipes applied
  - [x] `GET /auth/nonce` — GetNonceQuerySchema
  - [x] `POST /auth/verify` — VerifyBodySchema
  
- [x] **Raffles Module** — Schemas & validation pipes applied
  - [x] `GET /raffles` — ListRafflesQuerySchema
  - [x] `POST /raffles/:raffleId/metadata` — UpsertMetadataSchema
  
- [x] **Notifications Module** — Schemas & validation pipes applied
  - [x] `POST /notifications/subscribe` — SubscribeSchema
  
- [x] **Users Module** — Schemas & validation pipes applied
  - [x] `GET /users/:address/history` — UserHistoryQuerySchema
  
- [x] **Leaderboard Module** — Schemas & validation pipes applied
  - [x] `GET /leaderboard` — LeaderboardQuerySchema
  
- [x] **Search Module** — Schemas & validation pipes applied
  - [x] `GET /search` — SearchQuerySchema
  
- [x] **Support Module** — Schemas & validation pipes applied
  - [x] `POST /support` — SupportSchema
  
- [x] **Monitor Module** — Schemas & validation pipes applied (NEWLY CONVERTED)
  - [x] `GET /monitor/jobs` — JobsQuerySchema
  - [x] `GET /monitor/latency` — LatencyQuerySchema
  - [x] `GET /monitor/errors` — ErrorsQuerySchema

### Error Handling
- [x] All validation failures return consistent 400 response
  - [x] `statusCode: 400`
  - [x] `message: string` (concatenated error messages)
  - [x] `errors: ZodIssue[]` (detailed error array)
  
### Documentation
- [x] Quick Start Guide: `VALIDATION_GUIDE.md`
- [x] Detailed Reference: `VALIDATION_IMPLEMENTATION.md`
- [x] Schema Inventory: `VALIDATION_SCHEMAS.md`
- [x] Summary Document: `VALIDATION_SUMMARY.md`

---

## ✅ Validation Pipe Features

- [x] Type-safe with generics: `createZodPipe<T>(schema: ZodSchema<T>)`
- [x] Coercion support for numeric query params
- [x] Custom error messages per field
- [x] Enum validation
- [x] DateTime validation (ISO 8601)
- [x] URL validation
- [x] Email validation
- [x] String length constraints (min/max)
- [x] Number range constraints (min/max)
- [x] Optional/nullable field handling
- [x] Default value application

---

## ✅ Quality Assurance

### Type Safety
- [x] All DTO types generated via `z.infer<typeof Schema>`
- [x] No manual class-based DTOs for validated endpoints
- [x] TypeScript strict mode compatible

### Documentation
- [x] JSDoc comments on validation pipe
- [x] Schema documentation with examples
- [x] Error response examples shown
- [x] Best practices documented

### Testing
- [x] All schemas tested manually
- [x] Error cases verified
- [x] Edge cases (empty, null, 999, -1) tested
- [x] Type coercion tested (string → number)

---

## 📋 How to Use

### Adding Validation to New Endpoint

1. **Define Schema**
   ```typescript
   export const MySchema = z.object({
     field: z.string().min(1, 'Required'),
   });
   export type MyDto = z.infer<typeof MySchema>;
   ```

2. **Apply Pipe**
   ```typescript
   @Post()
   @UsePipes(new (createZodPipe(MySchema))())
   async create(@Body() payload: MyDto) { ... }
   ```

3. **Test**
   ```bash
   curl -X POST http://localhost:3000/my-endpoint -d '{"field": ""}'
   # Gets 400 validation error
   ```

### Common Validators
| Use Case | Schema | Example |
|----------|--------|---------|
| Query number | `z.coerce.number().min(1).max(100)` | `?limit=50` |
| Query enum | `z.enum(['a', 'b'])` | `?status=open` |
| Body string | `z.string().min(1).email()` | `{"email": "..."}` |
| Optional field | `z.string().optional()` | Can be omitted |
| Nullable field | `z.string().nullable()` | Can be `null` |
| Default value | `z.number().default(20)` | Uses 20 if omitted |

---

## 🔍 Verification Commands

### Unit Tests (if present)
```bash
npm run test -- zod-validation.pipe.spec.ts
```

### Manual Testing

**Valid Request:**
```bash
curl "http://localhost:3000/raffles?limit=50&offset=10"
# Returns 200 with raffles list
```

**Invalid Query (out of range):**
```bash
curl "http://localhost:3000/raffles?limit=999"
# Returns 400 with validation error
```

**Invalid Body:**
```bash
curl -X POST http://localhost:3000/notifications/subscribe \
  -H "Content-Type: application/json" \
  -d '{"raffleId": -1}'
# Returns 400 (raffleId must be positive)
```

**Missing Required Field:**
```bash
curl -X POST http://localhost:3000/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"address": "addr"}'
# Returns 400 (signature and nonce required)
```

---

## 📚 Documentation Files

Located in `backend/`:

1. **VALIDATION_GUIDE.md** (⭐ Start here)
   - Quick reference
   - Common patterns
   - Error examples
   - ~400 lines

2. **VALIDATION_IMPLEMENTATION.md**
   - Architecture overview
   - Pipe implementation details
   - Schema patterns
   - Testing examples
   - Advanced patterns
   - ~700 lines

3. **VALIDATION_SCHEMAS.md**
   - Complete inventory of all schemas
   - Module-by-module breakdown
   - Validation rules table
   - Error code reference
   - ~500 lines

4. **VALIDATION_SUMMARY.md** (Executive Summary)
   - What was done
   - Coverage overview
   - Quick start
   - Migration path
   - ~300 lines

---

## 🎯 Next Steps

### For Contributors

1. Read **VALIDATION_GUIDE.md** (5 min)
2. For new endpoints, copy the pattern from existing schemas
3. Reference **VALIDATION_SCHEMAS.md** for complex validators
4. Test with invalid inputs before submitting PR

### For Code Review

Checklist before approving endpoint PRs:

- [ ] All inputs validated with Zod schema
- [ ] Schema exported with clear comments
- [ ] DTO type inferred: `z.infer<typeof Schema>`
- [ ] `@UsePipes(new (createZodPipe(Schema))())` applied
- [ ] Error messages are user-friendly
- [ ] Tests verify both valid and invalid inputs
- [ ] Documentation updated if schema is complex

### For Maintenance

- Keep schemas in dedicated files (e.g., `api/rest/module/module.schema.ts`)
- Use consistent error message formatting
- Update docs if adding new patterns
- Monitor validation error logs for high volumes

---

## ✨ Key Benefits

✅ **Fail-Fast** — Invalid input rejected immediately  
✅ **Type-Safe** — Full TypeScript type inference  
✅ **Consistent** — All endpoints return same error format  
✅ **Maintainable** — Single source of truth (schema = validation + types)  
✅ **Flexible** — Supports all Zod features (transforms, refinements, etc.)  
✅ **Lightweight** — Zod is minimal, already in dependencies  
✅ **Well-Documented** — Four comprehensive guides included  

---

## 🚨 Common Gotchas

1. **Query params are strings** — Always use `z.coerce.number()` for numeric query params
2. **forget @UsePipes** — Won't break, just won't validate
3. **Type mismatch** — Use `z.infer<>` for DTO types
4. **Optional vs Nullable** — `.optional()` = field can be omitted, `.nullable()` = field can be null
5. **Default not applying** — Must use `.default()` in schema, not in controller

---

## 📞 Support

For questions, see:
- **Quick Help:** VALIDATION_GUIDE.md (Common Patterns section)
- **Deep Dive:** VALIDATION_IMPLEMENTATION.md (Advanced Patterns section)
- **Lookup:** VALIDATION_SCHEMAS.md (By Module section)
- **Troubleshooting:** VALIDATION_SUMMARY.md (Troubleshooting section)

---

**Last Updated:** March 30, 2026  
**Status:** ✅ Complete and Ready for Use
