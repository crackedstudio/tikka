# Issue #3: Split NestJS Dependencies from Core SDK

**Status:** ✅ COMPLETED

## Summary

`@tikka/sdk` is now framework-agnostic. NestJS dependencies (`@nestjs/common`, `@nestjs/core`, `reflect-metadata`, `rxjs`) are now optional peer dependencies, and CLI-only dependencies (`chalk`, `commander`, `inquirer`) are devDependencies. The core SDK services are plain TypeScript classes with no framework coupling.

## Changes Made

### 1. Dependencies Reorganized (`sdk/package.json`)

- `@nestjs/common`, `@nestjs/core`, `reflect-metadata`, `rxjs` → `peerDependencies` with `peerDependenciesMeta.optional: true`
- `chalk`, `commander`, `inquirer` → `devDependencies`
- Description updated from "NestJS SDK" to "SDK"
- `size-limit` ignore list updated to remove NestJS deps

### 2. Core Services Are Now Plain Classes

All SDK service classes had their `@Injectable()` decorators removed:
- `ContractService` — plain class, constructor takes `RpcService`, `HorizonService`, `NetworkConfig`, optional `WalletAdapter`, optional `contractId`
- `RpcService` — plain class (already was)
- `HorizonService` — plain class
- `MockRpcService` — plain class
- `FeeEstimatorService` — plain class, constructor takes `RpcService`, `HorizonService`, `NetworkConfig`, optional `WalletAdapter`, optional `contractId`
- `TicketReadService` — plain class

### 3. NestJS `@Module()` Decorators Removed from Module Files

All SDK module files had their `@Module()` decorators removed, keeping the class definitions for backward compatibility:
- `NetworkModule` — still has `forRoot()` static method returning `DynamicModule`
- `ContractModule`, `FeeEstimatorModule`, `RaffleModule`, `TicketModule`, `UserModule`, `AdminModule`

### 4. `app.module.ts` — Thin NestJS Layer

`AppModule.forRoot()` now uses factory providers to instantiate `ContractService` directly, rather than relying on NestJS DI to auto-resolve `@Injectable()` services. This keeps the NestJS wiring isolated to this single file.

### 5. Entry Point Updates

- `index.ts` — JSDoc updated to remove "NestJS SDK" reference
- `index.light.ts` — Removed `import 'reflect-metadata'` (no longer needed since services have no decorators)

### 6. Documentation

- `README.md` — Updated to remove "NestJS" from description
