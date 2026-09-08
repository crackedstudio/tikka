# Logger Integration

The SDK now provides a minimal logger interface that allows consumers to route, filter, or silence SDK output according to their own logging infrastructure.

## Problem

Previously, the SDK wrote directly to `console.*` (~32 calls in `sdk/src`), which gave consumers no way to:
- Route SDK logs to their backend logging systems (pino, winston, etc.)
- Filter or silence SDK debug output in production
- Correlate SDK operations with their application logs
- Prevent XDR and sensitive data from appearing in console on transaction paths

## Solution

### TikkaLogger Interface

A minimal logger interface with 4 methods:

```typescript
export interface TikkaLogger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}
```

### Default Behavior (No-Op)

By default, the SDK uses `NoOpLogger` which silences all output:

```typescript
import { RpcService, resolveNetworkConfig } from '@tikka/sdk';

const config = resolveNetworkConfig('testnet');
const rpc = new RpcService(config);
// No logs emitted
```

### Custom Logger Integration

Pass your own logger instance:

```typescript
import { RpcService, resolveNetworkConfig, ConsoleLogger } from '@tikka/sdk';
import pino from 'pino';

// Option 1: Use built-in ConsoleLogger for development
const config = resolveNetworkConfig('testnet');
const rpc = new RpcService(config, undefined, new ConsoleLogger());

// Option 2: Wrap your pino logger
const pinoLogger = pino({ level: 'info' });
const tikkaLogger = {
  debug: (msg: string, ...args: any[]) => pinoLogger.debug({ args }, msg),
  info: (msg: string, ...args: any[]) => pinoLogger.info({ args }, msg),
  warn: (msg: string, ...args: any[]) => pinoLogger.warn({ args }, msg),
  error: (msg: string, ...args: any[]) => pinoLogger.error({ args }, msg),
};
const rpcWithPino = new RpcService(config, undefined, tikkaLogger);

// Option 3: Winston adapter
import winston from 'winston';
const winstonLogger = winston.createLogger({ level: 'warn' });
const winstonAdapter = {
  debug: (msg: string, ...args: any[]) => winstonLogger.debug(msg, ...args),
  info: (msg: string, ...args: any[]) => winstonLogger.info(msg, ...args),
  warn: (msg: string, ...args: any[]) => winstonLogger.warn(msg, ...args),
  error: (msg: string, ...args: any[]) => winstonLogger.error(msg, ...args),
};
const rpcWithWinston = new RpcService(config, undefined, winstonAdapter);
```

### Services That Accept Logger

- `RpcService` (full and light builds)
- `TransactionHistoryParser.parseResult()` (static method, optional parameter)
- `withRetry()` utility (via `RetryOptions.logger`)

Additional services will thread logger through in future updates as needed.

## What Was Changed

### Files Modified
- `sdk/src/utils/logger.ts` — New logger interface and implementations
- `sdk/src/utils/index.ts` — Export logger types
- `sdk/src/network/rpc.service.ts` — Accept logger in constructor, replace console calls
- `sdk/src/light/rpc.service.ts` — Accept logger in constructor, replace console calls
- `sdk/src/utils/parser.ts` — Accept optional logger parameter
- `sdk/src/utils/retry.ts` — Accept optional logger in RetryOptions
- `sdk/eslint.config.js` — Add `no-console` rule with `bin/` override

### Console Calls Removed
All `console.*` calls in `sdk/src` (excluding test files and the CLI in `sdk/bin/`) have been replaced with logger calls. Remaining console references are:
- Documentation/JSDoc examples
- The `ConsoleLogger` class itself

## ESLint Enforcement

The SDK now enforces `no-console: error` for all `src/**/*.ts` files, with an exception for `bin/**/*` (the CLI where console output is the product):

```javascript
// sdk/eslint.config.js
rules: {
  'no-console': 'error',
},
// ...
{
  files: ['bin/**/*.js', 'bin/**/*.mjs', 'bin/**/*.cjs'],
  rules: {
    'no-console': 'off',
  },
}
```

Run `pnpm run lint` to verify compliance.

## Migration Guide for SDK Consumers

If you were previously suppressing console noise from the SDK, you can now:

**Before:**
```typescript
// No control over SDK logging
const rpc = new RpcService(config);
```

**After (silent by default):**
```typescript
// Silent by default (no-op logger)
const rpc = new RpcService(config);
```

**After (with your logger):**
```typescript
import { ConsoleLogger } from '@tikka/sdk';

// Development: use ConsoleLogger
const rpc = new RpcService(config, undefined, new ConsoleLogger());

// Production: use your app's logger
const rpc = new RpcService(config, undefined, myAppLogger);
```

## Future Work

- Thread logger through remaining high-level services (ContractService, FeeEstimatorService, etc.)
- Add structured logging context (request IDs, network, operation)
- Consider log levels per-service configuration
