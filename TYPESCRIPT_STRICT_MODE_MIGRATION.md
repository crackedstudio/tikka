# TypeScript Strict Mode Migration Guide

## Overview

This document outlines the approach for migrating the NestJS packages (backend, oracle, indexer, sdk) to TypeScript strict mode. The shared `tsconfig.base.json` has been created with `strict: true` enabled, and all packages now extend from it.

## Status

- ✅ Shared `tsconfig.base.json` created with strict mode enabled
- ✅ All NestJS package tsconfig files updated to extend base config
- ⏳ Compilation errors need to be fixed package by package

## What Strict Mode Enables

The `strict: true` flag enables these compiler options:

1. **strictNullChecks** - `null` and `undefined` are distinct types
2. **noImplicitAny** - Error on expressions with implied `any` type
3. **strictBindCallApply** - Check `bind`, `call`, `apply` methods on functions
4. **strictFunctionTypes** - Function parameter bivariance checking
5. **strictPropertyInitialization** - Class properties must be initialized
6. **noImplicitThis** - Error when `this` has type `any`
7. **alwaysStrict** - Parse in strict mode and emit "use strict"
8. **useUnknownInCatchVariables** - Catch variables are `unknown` instead of `any`

## Migration Strategy

### Phase 1: Assessment (CURRENT)
Run TypeScript compiler in each package to identify errors:

```powershell
# Backend
cd backend
npx tsc --noEmit

# Oracle  
cd oracle
npx tsc --noEmit

# Indexer
cd indexer
npx tsc --noEmit

# SDK
cd sdk
npx tsc --noEmit
```

### Phase 2: Fix by Package (ONE PR PER PACKAGE)

Work through packages one at a time. Suggested order based on dependencies:
1. **SDK** (no dependencies on other tikka packages)
2. **Indexer** (depends on SDK)
3. **Oracle** (depends on SDK)
4. **Backend** (depends on SDK)

### Phase 3: Common Error Patterns and Fixes

#### 1. Uninitialized Class Properties

**Error:**
```typescript
class MyService {
  private connection: Database; // ❌ Property has no initializer
}
```

**Fixes:**
```typescript
// Option A: Initialize in declaration
class MyService {
  private connection: Database | null = null;
}

// Option B: Definite assignment assertion (use sparingly!)
class MyService {
  private connection!: Database;
  
  constructor() {
    this.initConnection(); // Must be called in constructor
  }
}

// Option C: Initialize in constructor
class MyService {
  constructor(private connection: Database) {}
}
```

#### 2. Implicit `any` Types

**Error:**
```typescript
function process(data) { // ❌ Parameter 'data' implicitly has 'any' type
  return data.value;
}
```

**Fix:**
```typescript
function process(data: { value: string }): string {
  return data.value;
}

// Or use a defined type
interface DataInput {
  value: string;
}

function process(data: DataInput): string {
  return data.value;
}
```

#### 3. `unknown` in Catch Blocks

**Error:**
```typescript
try {
  await someOperation();
} catch (err) {
  console.log(err.message); // ❌ 'err' is of type 'unknown'
}
```

**Fix:**
```typescript
try {
  await someOperation();
} catch (err) {
  if (err instanceof Error) {
    console.log(err.message);
  } else {
    console.log('Unknown error:', String(err));
  }
}

// Or use a type guard utility
function isError(err: unknown): err is Error {
  return err instanceof Error;
}

try {
  await someOperation();
} catch (err) {
  if (isError(err)) {
    console.log(err.message);
  }
}
```

#### 4. Null/Undefined Checks

**Error:**
```typescript
function getName(user: User | null) {
  return user.name; // ❌ Object is possibly 'null'
}
```

**Fix:**
```typescript
function getName(user: User | null): string | null {
  return user?.name ?? null;
}

// Or with explicit check
function getName(user: User | null): string {
  if (!user) {
    throw new Error('User is required');
  }
  return user.name;
}
```

#### 5. Function Parameter Strictness

**Error:**
```typescript
type Handler = (event: Event) => void;
const handler: Handler = (event: MouseEvent) => {}; // ❌ Type mismatch
```

**Fix:**
```typescript
// Make base type more specific
type Handler = (event: MouseEvent) => void;
const handler: Handler = (event: MouseEvent) => {};

// Or use generics
type Handler<T extends Event = Event> = (event: T) => void;
const handler: Handler<MouseEvent> = (event) => {};
```

#### 6. Type Assertions vs Type Guards

**Bad (avoid `as` when possible):**
```typescript
const data = response.data as MyType;
```

**Better (use type guards):**
```typescript
function isMyType(data: unknown): data is MyType {
  return (
    typeof data === 'object' &&
    data !== null &&
    'requiredField' in data
  );
}

if (isMyType(response.data)) {
  const data = response.data; // TypeScript knows it's MyType
}
```

### Phase 4: High-Risk Areas

Based on the issue description, focus on these areas first:

#### Oracle (`oracle/src/submitter/`)
- Contract interaction code
- Transaction submission logic
- State management

#### Indexer (`indexer/src/ingestor/`)
- Event processing
- Data transformation
- Database writes

#### SDK (`sdk/src/contract/bindings.ts`)
- Contract bindings
- Type definitions from Soroban

### Phase 5: Suppressions

When a fix is not immediately obvious:

```typescript
// @ts-expect-error TODO(#issue-number): Fix strict null check here
const value = potentiallyNull.property;
```

**Rules for suppressions:**
1. Always include a comment explaining why
2. Link to a GitHub issue for tracking
3. Use `@ts-expect-error` (not `@ts-ignore`) so it errors if the issue is fixed
4. Keep suppressions as narrow as possible (single line, not whole functions)

### Phase 6: Testing

After fixing each package:

```powershell
# Run type check
npx tsc --noEmit

# Run tests
npm test

# Run linter
npm run lint
```

### Phase 7: Documentation

For each package PR, include:
- Count of errors fixed
- Count of suppressions added (should be minimal)
- Any breaking API changes
- Testing performed

## Expected Error Counts

Based on issue description: ~850 `any` / `as any` occurrences across all packages.

Breakdown estimate:
- **SDK**: ~200 errors (contract bindings complexity)
- **Oracle**: ~250 errors (submitter logic)
- **Indexer**: ~250 errors (ingestor logic)
- **Backend**: ~150 errors (various services)

## Benefits After Migration

1. **Catch bugs at compile time** instead of runtime
2. **Better IDE autocomplete** and IntelliSense
3. **Safer refactoring** with confidence
4. **Clearer contracts** between functions and modules
5. **Reduced runtime errors** from null/undefined access

## Timeline Estimate

- SDK: 2-3 days
- Indexer: 3-4 days
- Oracle: 3-4 days  
- Backend: 2-3 days

Total: ~2 weeks for full migration with testing

## Resources

- [TypeScript Strict Mode](https://www.typescriptlang.org/tsconfig#strict)
- [Migrating to Strict Mode](https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html)
- [Type Guards and Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
