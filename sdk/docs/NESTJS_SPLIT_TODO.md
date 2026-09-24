# Issue #3: Split NestJS Dependencies from Core SDK

**Status:** TODO - Requires major refactoring with breaking changes

## Summary

`@tikka/sdk` is described as a library for any Stellar consumer, but `sdk/package.json` lists @nestjs/common, @nestjs/core, reflect-metadata, and rxjs as hard runtime dependencies. Plus CLI-only dependencies (chalk, commander, inquirer). A browser app installing the SDK pulls the entire Nest runtime and three terminal libraries.

This is why the client reimplemented contract access instead of consuming the SDK.

## Why This Is Deferred

This is a **major architectural refactor** requiring:
- Breaking changes to SDK module structure
- Migration guide for existing consumers
- Coordination with backend/oracle teams (they use the NestJS modules)
- Comprehensive testing across all environments
- Potential major version bump (1.0.0)

## Current Workaround

The SDK currently provides entry points that help with tree-shaking:
- `@tikka/sdk` - Full SDK with NestJS modules
- `@tikka/sdk/read` - Read-only, smaller bundle
- `@tikka/sdk/write` - Write operations without full DI
- `@tikka/sdk/light` - Minimal browser bundle

These provide interim relief for bundle size concerns.

## What Needs To Be Done

### Phase 1: Separate Core from Framework

**Goal:** Create a pure TypeScript core that works in any environment.

```
sdk/
├── core/           # Framework-agnostic core
│   ├── contract/   # Contract interaction logic
│   ├── wallet/     # Wallet adapters
│   ├── network/    # RPC/Horizon services (plain classes)
│   └── utils/      # Pure utilities
└── nestjs/         # NestJS wrappers
    ├── modules/    # @Injectable() wrappers
    └── app.module.ts
```

**Changes:**
- Remove @Injectable() decorators from core services
- Make RpcService, ContractService, etc. plain classes
- No rxjs, no reflect-metadata in core

### Phase 2: Update Dependencies

Move NestJS dependencies to appropriate categories:

**package.json changes:**
```json
{
  "dependencies": {
    "@stellar/stellar-sdk": "^16.1.0",
    "bignumber.js": "^11.1.4"
  },
  "peerDependencies": {
    "@nestjs/common": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "rxjs": "^7.8.0",
    "reflect-metadata": "^0.2.0"
  },
  "peerDependenciesMeta": {
    "@nestjs/common": { "optional": true },
    "@nestjs/core": { "optional": true },
    "rxjs": { "optional": true },
    "reflect-metadata": { "optional": true }
  },
  "devDependencies": {
    "chalk": "^5.3.0",
    "commander": "^12.1.0",
    "inquirer": "^14.0.2"
  }
}
```

### Phase 3: Split or Bundle CLI

**Option A: Keep CLI in bin/**
- Ship CLI as optional bin
- Install commander/chalk/inquirer only for CLI users

**Option B: Separate Package**
- Create `@tikka/cli` package
- Depends on `@tikka/sdk`
- Cleaner separation

**Recommendation:** Option B for cleaner separation and versioning.

### Phase 4: Update Entry Points

```json
{
  "exports": {
    ".": {
      "import": "./dist/core/index.js",
      "types": "./dist/core/index.d.ts"
    },
    "./nestjs": {
      "import": "./dist/nestjs/index.js",
      "types": "./dist/nestjs/index.d.ts"
    },
    "./read": {
      "import": "./dist/read/index.js",
      "types": "./dist/read/index.d.ts"
    }
  }
}
```

### Phase 5: Migration Guide

Document the breaking changes:

**Before:**
```typescript
import { RaffleModule } from '@tikka/sdk';

@Module({
  imports: [RaffleModule]
})
export class AppModule {}
```

**After:**
```typescript
import { RaffleModule } from '@tikka/sdk/nestjs';

@Module({
  imports: [RaffleModule]
})
export class AppModule {}
```

**For non-NestJS consumers:**
```typescript
// Before (pulled in all of NestJS)
import { RpcService } from '@tikka/sdk';

// After (no NestJS)
import { RpcService } from '@tikka/sdk';
const rpc = new RpcService(config);
```

### Phase 6: Verify Bundle Sizes

Test with a clean Vite app:

```bash
npm create vite@latest test-app -- --template react-ts
cd test-app
npm install @tikka/sdk
npm run build
# Check bundle size
```

**Target:** Core SDK should add <100 KB to production bundle (gzipped).

### Phase 7: Update Documentation

- README.md - New import paths
- MIGRATION.md - Upgrade guide from 0.x to 1.x
- Browser support matrix
- Bundle size comparison

## Acceptance Criteria

- [ ] Browser app can install SDK without @nestjs/* in node_modules
- [ ] Backend/oracle can still use NestJS modules via `@tikka/sdk/nestjs`
- [ ] CLI dependencies not in production bundles
- [ ] Migration guide published
- [ ] All tests pass (unit + integration + e2e)
- [ ] Bundle size <100 KB for core SDK
- [ ] Documentation updated

## Breaking Changes

This will be a **major version bump** (1.0.0):

1. Import path changes for NestJS modules
2. CLI may move to separate package
3. Some internal APIs may change

## Estimated Effort

- 2-3 days for core refactoring
- 1 day for testing and verification
- 1 day for documentation and migration guide
- Total: **1 week** of focused work

## Dependencies

- Coordination with backend/oracle teams (they consume NestJS modules)
- Agreement on version numbering (1.0.0?)
- Testing in production-like environments

## Risks

1. **Breaking existing consumers** - Backend and oracle need to update imports
2. **Testing coverage gaps** - Need to verify in browser, Node, NestJS contexts
3. **Bundle size regression** - Must verify tree-shaking works

## Recommended Approach

1. Create a feature branch
2. Implement core/nestjs split
3. Update internal consumers (backend, oracle) on the branch
4. Comprehensive testing
5. Write migration guide
6. Release as 1.0.0-beta
7. Gather feedback
8. Release 1.0.0 stable

## Related Issues

- Issue #1: Logger interface (completed, works with this change)
- Issue #2: Typed bindings (independent, can be done before or after)
- Issue #4: Docker (independent)

## Notes

The current read/light/write entry points are a good interim solution. This refactor should be scheduled when:
- There's bandwidth for thorough testing
- All consumers can coordinate the migration
- We're ready for a major version release
