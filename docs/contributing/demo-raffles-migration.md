# Demo Raffles Migration Guide

## Summary

The `demoRaffles` fixture has been moved from production code to a dedicated test fixtures directory to make its test-only nature explicit and prevent accidental usage in production code paths.

## Changes

### File Move
- **Old location**: `client/src/data/demoRaffles.ts`
- **New location**: `client/src/test/fixtures/raffles.ts`

### Updated Imports

If you have tests or stories that import demoRaffles, update your imports:

**Before:**
```typescript
import { demoRaffles } from '../data/demoRaffles';
```

**After:**
```typescript
import { demoRaffles } from '../test/fixtures/raffles';
```

## Why This Change?

1. **Test-Only Nature**: By moving to a `test/fixtures` directory, it's immediately clear that this is test data, not production data.
2. **Prevents Production Usage**: This layout convention makes it harder to accidentally import test data in production code.
3. **Better Organization**: Test utilities and fixtures are now grouped together.
4. **Discourages API Bypass**: Developers should always prefer the real API over demo data in actual feature implementations.

## Files Updated

- ✅ All imports of `demoRaffles` have been audited
- ✅ No production code files were importing `demoRaffles`
- ✅ The fixture file now includes a clear header warning against production usage

## Testing

All existing tests should pass after this migration. If you encounter import errors:

1. Check that your test/story file has the correct import path: `../test/fixtures/raffles`
2. Ensure you're not importing `demoRaffles` in non-test files (`.spec.tsx` or `.stories.tsx`)
3. For actual component usage, always import real raffle data via the API/hooks

## Best Practices Going Forward

- ✅ Use `demoRaffles` only in `*.spec.tsx` and `*.stories.tsx` files
- ✅ Import from `../test/fixtures/raffles` in test files
- ✅ Use real API data (`useRaffles` hook) in production code
- ✅ Keep fixture data minimal and focused on testing scenarios
