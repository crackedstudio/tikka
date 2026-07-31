# Zod v3 → v4 Migration Fixes

## Progress

- [x] Step 0: Analyze codebase and create plan
- [ ] Step 1: Fix error handling in `config.loader.ts` - properly handle ZodError using `.issues` array
- [ ] Step 2: Fix error formatting in `verify-config.ts` - update to work with v4's ZodError structure
- [ ] Step 3: Audit schemas in `config.schema.ts` - check for v4 API changes (z.discriminatedUnion)
- [ ] Step 4: Update test assertions in `config.loader.spec.ts` - error message patterns may differ
- [ ] Step 5: Add new config-parsing test (`src/config/config-parsing.spec.ts`)
- [ ] Step 6: Install dependencies and run tests to verify

