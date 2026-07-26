# Tikka SDK Light Version

A lightweight, framework-agnostic version of the Tikka SDK designed for mobile and browser integrations.

## Features
- **Zero NestJS Overheads**: No decorators or dependency injection logic.
- **Small Footprint**: Target < 50kb gzipped.
- **ESM Ready**: Optimized for modern bundlers (Vite, Webpack 5).

## Usage
Import the light bundle when you need a small, browser-friendly runtime:

```ts
import { RpcService, Raffle, NetworkConfig } from '@tikka/sdk/dist/light/index.light';
```

## Public exports
- `RpcService` — browser-safe RPC client for Soroban and Horizon calls
- `Raffle` — lightweight raffle DTO
- `NetworkConfig` — browser-friendly network configuration type
- `ContractResponse` — generic contract response shape
- `resolveNetworkConfig` and `DEFAULT_RPC_CONFIG` for network helpers

## When to use full vs light SDK
- Use the **full SDK** when you need NestJS module integration, high-level services,
  and dependency injection (`RaffleService`, `TicketService`, `TikkaModule`, etc.).
- Use the **light SDK** when you need a minimal browser or mobile bundle and
  only require low-level RPC access and lightweight types.

## Limitations
- No NestJS module support or decorators in the light bundle.
- No high-level Nest-managed service lifecycle.
- Manual instantiation is required for the exported runtime classes.

# Tikka SDK Light
This version is optimized for mobile and browser environments.

## How to use
Import from `@tikka/sdk/dist/light/index.light`.

## Exclusions
- Does not include NestJS Modules or Providers.
- Services must be instantiated manually (e.g., `new RpcService()`).